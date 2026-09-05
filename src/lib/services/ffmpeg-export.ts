import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import ffmpeg from "fluent-ffmpeg";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import {
  ensureProjectDirs,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import {
  durationMs,
  totalTimelineFrames as computeTotalTimelineFrames,
} from "@/lib/timing/frames";
import { resolveTrackTiming } from "@/lib/finishing/audio-track-timing";
import { resolveFfmpegBinary } from "@/lib/services/ffmpeg-path";
import { getFfmpegPathSetting } from "@/lib/services/settings";
import {
  parseShotRenderOverrides,
  resolveShotAudioPolicy,
} from "@/lib/shot-render-overrides";
import { listTextOverlays } from "@/lib/services/text-overlays";
import {
  buildExactSizeVideoFilter,
  buildExportAudioMixGraph,
  buildOverlayDrawtextFilters,
  EXPORT_LOUDNORM_FILTER,
  resolveOutputFrameSize,
} from "@/lib/services/export-filters";
import { parseProjectRenderSettings } from "@/lib/services/render-settings-resolver";
import { writeSilentWav } from "@/lib/services/silent-wav";

/** Bundled font used to burn text overlays into the export. */
export function resolveExportOverlayFontPath(): string {
  return path.join(
    process.cwd(),
    "assets",
    "fonts",
    "DejaVuSans-Bold.ttf"
  );
}

export interface ExportSettings {
  fps?: number;
  format?: "mp4" | "webm";
  videoCodec?: string;
  audioCodec?: string;
  crf?: number;
  includeAudio?: boolean;
  outputFileName?: string;
  /** Used to persist frame previews for the export UI. */
  exportJobId?: string;
}

export interface ExportProgressUpdate {
  progress: number;
  message: string;
  currentFrame?: number;
  totalFrames?: number;
  previewFramePath?: string;
}

export type ExportProgressCallback = (
  update: ExportProgressUpdate
) => void | Promise<void>;

async function configureFfmpeg(customPath?: string | null): Promise<void> {
  const resolved = await resolveFfmpegBinary(customPath);
  if (!resolved || resolved === "ffmpeg") return;
  ffmpeg.setFfmpegPath(resolved);
  const ffprobePath = resolved.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
  if (fs.existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
  }
}

function runFfmpeg(
  command: ffmpeg.FfmpegCommand,
  options?: {
    onProgress?: (progress: {
      percent?: number;
      timemark?: string;
      frames?: number;
    }) => void;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options?.onProgress) {
      command.on("progress", options.onProgress);
    }
    command.on("end", () => resolve()).on("error", (err: Error) => reject(err)).run();
  });
}

function probeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(
      filePath,
      (err: Error | null, metadata: ffmpeg.FfprobeData) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ?? 0);
      }
    );
  });
}

function probeHasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(
      filePath,
      (err: Error | null, metadata: ffmpeg.FfprobeData) => {
        if (err) return reject(err);
        resolve(
          (metadata.streams ?? []).some(
            (stream) => stream.codec_type === "audio"
          )
        );
      }
    );
  });
}

export interface ExportOutputMeta {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  overlayCount: number;
  audioSource: "shots" | "shots+tracks" | "none";
}

const VIDEO_RENDER_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
]);

export function isVideoRenderFile(filePath: string): boolean {
  return VIDEO_RENDER_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Re-encode a render so it matches the project output size exactly. */
export async function conformVideoToExactSize(
  filePath: string,
  width: number,
  height: number
): Promise<void> {
  await configureFfmpeg(await getFfmpegPathSetting());
  const probed = await probeExportOutputMeta(filePath);
  if (probed.width === width && probed.height === height) return;

  const tempPath = `${filePath}.conform-${width}x${height}.mp4`;
  const hasAudio = await probeHasAudioStream(filePath).catch(() => false);
  const command = ffmpeg(filePath).videoFilters(
    buildExactSizeVideoFilter(width, height)
  );
  const outputOptions = [
    "-map",
    "0:v:0",
    "-c:v",
    "libx264",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
  ];
  if (hasAudio) {
    outputOptions.push("-map", "0:a:0", "-c:a", "copy");
  } else {
    outputOptions.push("-an");
  }

  await runFfmpeg(command.outputOptions(outputOptions).output(tempPath));
  fs.rmSync(filePath, { force: true });
  fs.renameSync(tempPath, filePath);
}

export function probeExportOutputMeta(
  filePath: string
): Promise<{ width: number | null; height: number | null; durationSeconds: number | null }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(
      filePath,
      (err: Error | null, metadata: ffmpeg.FfprobeData) => {
        if (err) return reject(err);
        const video = (metadata.streams ?? []).find(
          (stream) => stream.codec_type === "video"
        );
        resolve({
          width: video?.width ?? null,
          height: video?.height ?? null,
          durationSeconds: metadata.format.duration ?? null,
        });
      }
    );
  });
}

async function extractPreviewFrame(options: {
  inputPath: string;
  outputPath: string;
  frameNumber: number;
  fps: number;
}): Promise<void> {
  const timeSec = Math.max(0, options.frameNumber / options.fps);
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  await runFfmpeg(
    ffmpeg(options.inputPath)
      .seekInput(timeSec)
      .outputOptions(["-frames:v", "1", "-q:v", "2"])
      .output(options.outputPath)
  );
}

async function trimClip(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number,
  fps: number,
  audio: "source" | "silent",
  frameSize?: { width: number; height: number } | null
): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Every clip gets a uniform stereo 48k AAC audio stream so the concat
  // demuxer sees consistent streams whether shots keep or mute their audio.
  let command = ffmpeg(inputPath).setStartTime(startSec);
  const outputOptions = ["-r", String(fps), "-vsync", "cfr"];
  if (frameSize) {
    command = command.videoFilters(
      buildExactSizeVideoFilter(frameSize.width, frameSize.height)
    );
  }

  if (audio === "source") {
    outputOptions.push("-map", "0:v:0", "-map", "0:a:0", "-af", "apad");
  } else {
    // fluent-ffmpeg rejects -f lavfi on FFmpeg 8 because it no longer
    // parses the device-flag column in `ffmpeg -formats`. A real silent
    // WAV avoids that check and works on any build.
    const silencePath = outputPath.replace(/(\.[^.]+)?$/, "-silence.wav");
    writeSilentWav(silencePath, durationSec + 0.05);
    command = command.input(silencePath);
    outputOptions.push("-map", "0:v:0", "-map", "1:a:0");
  }

  outputOptions.push("-c:a", "aac", "-ar", "48000", "-ac", "2");

  await runFfmpeg(
    command
      .setDuration(durationSec)
      .outputOptions(outputOptions)
      .output(outputPath)
  );
}

function shotExportFrames(
  shot: (typeof schema.shots.$inferSelect),
  fps: number
): number {
  const shotFps = shot.fps ?? fps;
  const trimIn = shot.trimInFrames ?? 0;
  const trimOut = shot.trimOutFrames ?? shot.durationFrames;
  return Math.max(1, trimOut - trimIn);
}

export interface ExportResult {
  /** Output path relative to the project root, forward slashes. */
  outputPath: string;
  meta: ExportOutputMeta;
}

export async function runExport(
  projectId: string,
  settings: ExportSettings = {},
  onProgress?: ExportProgressCallback
): Promise<ExportResult> {
  const report = async (update: ExportProgressUpdate) => {
    await onProgress?.(update);
  };

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  await configureFfmpeg(await getFfmpegPathSetting());

  const fps = settings.fps ?? project.defaultFps;
  const frameSize = resolveOutputFrameSize(
    parseProjectRenderSettings(project.renderSettingsJson)
  );
  const dirs = ensureProjectDirs(project);
  const projectRoot = resolveProjectRoot(project);

  const shots = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.projectId, projectId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const exportableShots = shots.filter((shot) => {
    if (!shot.videoPath) return false;
    return fs.existsSync(path.join(projectRoot, shot.videoPath));
  });

  const totalFrames = exportableShots.reduce(
    (sum, shot) => sum + shotExportFrames(shot, fps),
    0
  );

  if (exportableShots.length === 0) {
    throw new Error("No rendered shot videos available for export");
  }

  await report({
    progress: 0.02,
    message: "Preparing export…",
    currentFrame: 0,
    totalFrames,
  });

  const clips: string[] = [];
  const scratchDir = path.join(dirs.scratch, "export", nanoid());
  const previewDir = path.join(
    dirs.scratch,
    "export-previews",
    settings.exportJobId ?? nanoid()
  );
  fs.mkdirSync(scratchDir, { recursive: true });
  fs.mkdirSync(previewDir, { recursive: true });

  let processedFrames = 0;
  let lastPreviewFrame = -1;

  const maybePreview = async (
    sourcePath: string,
    globalFrame: number,
    progress: number,
    message: string,
    localFrame = 0
  ) => {
    const shouldCapture =
      globalFrame === 0 ||
      globalFrame % 10 === 0 ||
      globalFrame >= totalFrames - 1;

    if (!shouldCapture || globalFrame === lastPreviewFrame) {
      await report({ progress, message, currentFrame: globalFrame, totalFrames });
      return;
    }

    lastPreviewFrame = globalFrame;
    const previewName = `frame-${String(globalFrame).padStart(5, "0")}.jpg`;
    const previewAbsolute = path.join(previewDir, previewName);

    try {
      await extractPreviewFrame({
        inputPath: sourcePath,
        outputPath: previewAbsolute,
        frameNumber: Math.max(0, localFrame),
        fps,
      });
      const previewRelative = path
        .relative(projectRoot, previewAbsolute)
        .replace(/\\/g, "/");
      await report({
        progress,
        message,
        currentFrame: globalFrame,
        totalFrames,
        previewFramePath: previewRelative,
      });
    } catch {
      await report({ progress, message, currentFrame: globalFrame, totalFrames });
    }
  };

  const includeAudio = settings.includeAudio !== false;

  const audioTracks = includeAudio
    ? db
        .select()
        .from(schema.audioTracks)
        .where(eq(schema.audioTracks.projectId, projectId))
        .all()
        .filter((track) => {
          if (!track.filePath || track.filePath.includes("pending")) return false;
          return fs.existsSync(path.join(projectRoot, track.filePath));
        })
    : [];

  try {
    for (let i = 0; i < exportableShots.length; i++) {
      const shot = exportableShots[i];
      const sourcePath = path.join(projectRoot, shot.videoPath!);
      const shotFps = shot.fps ?? fps;
      const trimIn = shot.trimInFrames ?? 0;
      const trimOut = shot.trimOutFrames ?? shot.durationFrames;
      const frameCount = Math.max(1, trimOut - trimIn);
      const startSec = durationMs(trimIn, shotFps) / 1000;
      const durationSec = durationMs(frameCount, shotFps) / 1000;

      await report({
        progress: 0.05 + (processedFrames / totalFrames) * 0.45,
        message: `Trimming shot ${i + 1} of ${exportableShots.length}…`,
        currentFrame: processedFrames,
        totalFrames,
      });

      const audioPolicy = resolveShotAudioPolicy(
        parseShotRenderOverrides(shot.renderOverridesJson).audioPolicy,
        audioTracks.length > 0
      );
      const sourceHasAudio =
        audioPolicy === "keep" &&
        (await probeHasAudioStream(sourcePath).catch(() => false));

      const clipPath = path.join(scratchDir, `clip-${String(i).padStart(3, "0")}.mp4`);
      await trimClip(
        sourcePath,
        clipPath,
        startSec,
        durationSec,
        fps,
        sourceHasAudio ? "source" : "silent",
        frameSize
      );
      clips.push(clipPath);

      processedFrames += frameCount;
      await maybePreview(
        clipPath,
        processedFrames,
        0.05 + (processedFrames / totalFrames) * 0.45,
        `Trimmed shot ${i + 1} of ${exportableShots.length}`,
        Math.min(10, Math.max(0, frameCount - 1))
      );
    }

    const format = settings.format ?? "mp4";
    const outputFileName =
      settings.outputFileName ?? `export-${Date.now()}.${format}`;
    const outputAbsolute = path.join(dirs.exports, outputFileName);
    fs.mkdirSync(dirs.exports, { recursive: true });

    const listFile = path.join(scratchDir, "concat.txt");
    fs.writeFileSync(
      listFile,
      clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n")
    );

    // Burn text overlays into the concat encode. Overlay frames are
    // timeline-global on the trimmed timeline, matching video-sync semantics.
    const overlays = listTextOverlays(projectId);
    const fontPath = resolveExportOverlayFontPath();
    const drawtextFilters = fs.existsSync(fontPath)
      ? buildOverlayDrawtextFilters(overlays, fps, fontPath)
      : [];
    const overlaysBurned = drawtextFilters.length;
    if (overlays.length > 0 && drawtextFilters.length === 0) {
      console.warn(
        `[export] Overlay font not found at ${fontPath}; text overlays were not burned in`
      );
    }

    await report({
      progress: 0.52,
      message: "Encoding video…",
      currentFrame: processedFrames,
      totalFrames,
    });

    let concatFrames = 0;
    const concatCommand = ffmpeg()
      .input(listFile)
      .inputOptions(["-f", "concat", "-safe", "0"]);
    if (drawtextFilters.length > 0) {
      concatCommand.videoFilters(drawtextFilters);
    }
    await runFfmpeg(
      concatCommand
        .outputOptions([
          "-r",
          String(fps),
          "-vsync",
          "cfr",
          "-c:v",
          settings.videoCodec ?? (format === "webm" ? "libvpx-vp9" : "libx264"),
          ...(settings.crf != null ? ["-crf", String(settings.crf)] : []),
          ...(includeAudio
            ? [
                "-c:a",
                settings.audioCodec ?? "aac",
                "-ar",
                "48000",
                // With timeline tracks, loudnorm runs after the final mix
                // instead so it is not applied twice.
                ...(audioTracks.length === 0
                  ? ["-af", EXPORT_LOUDNORM_FILTER]
                  : []),
              ]
            : ["-an"]),
        ])
        .output(outputAbsolute),
      {
        onProgress: (progress) => {
          const frame = progress.frames ?? 0;
          concatFrames = frame;
          void report({
            progress:
              0.52 + Math.min(1, frame / Math.max(1, totalFrames)) * 0.28,
            message: "Encoding video…",
            currentFrame: Math.min(frame, totalFrames),
            totalFrames,
          });
        },
      }
    );

    let finalOutput = outputAbsolute;
    let audioSource: ExportOutputMeta["audioSource"] = includeAudio
      ? "shots"
      : "none";

    if (includeAudio && audioTracks.length > 0) {
      await report({
        progress: 0.82,
        message: "Mixing audio…",
        currentFrame: Math.max(concatFrames, totalFrames),
        totalFrames,
      });

      const withAudioPath = path.join(
        dirs.exports,
        outputFileName.replace(/\.[^.]+$/, `-audio.${format}`)
      );
      const videoDuration = await probeDurationSeconds(outputAbsolute);
      let command = ffmpeg(outputAbsolute);
      // Track timing lives on the trimmed timeline, matching the trimmed
      // clips concatenated above and the finishing preview.
      const timelineFrames = computeTotalTimelineFrames(shots);

      for (const track of audioTracks) {
        const trackPath = path.join(projectRoot, track.filePath);
        const timing = resolveTrackTiming(track, shots, timelineFrames);
        const startSec = durationMs(timing.startFrame, fps) / 1000;
        const durationSec = durationMs(timing.durationFrames, fps) / 1000;
        command = command.input(trackPath).inputOptions([
          "-ss",
          String(startSec),
          "-t",
          String(durationSec),
        ]);
      }

      // Mix the shot audio (input 0) with the timeline tracks at their
      // stored volumes, then normalize loudness on the result.
      const mixGraph = buildExportAudioMixGraph(
        audioTracks.map((track) => track.volume ?? 1)
      );

      await runFfmpeg(
        command
          .complexFilter(mixGraph.filters)
          .outputOptions([
            "-map",
            "0:v:0",
            "-map",
            `[${mixGraph.outputLabel}]`,
            "-c:v",
            "copy",
            "-t",
            String(videoDuration),
            "-c:a",
            settings.audioCodec ?? "aac",
            "-ar",
            "48000",
          ])
          .output(withAudioPath)
      );

      fs.unlinkSync(outputAbsolute);
      finalOutput = withAudioPath;
      audioSource = "shots+tracks";
    }

    await report({
      progress: 0.98,
      message: "Finalizing export…",
      currentFrame: totalFrames,
      totalFrames,
    });

    try {
      const finalPreview = path.join(previewDir, "final.jpg");
      await extractPreviewFrame({
        inputPath: finalOutput,
        outputPath: finalPreview,
        frameNumber: Math.max(0, Math.floor(totalFrames / 2)),
        fps,
      });
      const previewRelative = path
        .relative(projectRoot, finalPreview)
        .replace(/\\/g, "/");
      await report({
        progress: 1,
        message: "Export complete",
        currentFrame: totalFrames,
        totalFrames,
        previewFramePath: previewRelative,
      });
    } catch {
      await report({
        progress: 1,
        message: "Export complete",
        currentFrame: totalFrames,
        totalFrames,
      });
    }

    let outputMeta: ExportOutputMeta = {
      width: null,
      height: null,
      durationSeconds: null,
      overlayCount: overlaysBurned,
      audioSource,
    };
    try {
      const probed = await probeExportOutputMeta(finalOutput);
      outputMeta = { ...outputMeta, ...probed };
    } catch {
      // Metadata is informational; keep the export even if probing fails.
    }

    return {
      outputPath: path.relative(projectRoot, finalOutput).replace(/\\/g, "/"),
      meta: outputMeta,
    };
  } finally {
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  }
}
