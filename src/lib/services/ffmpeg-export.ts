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
import { durationMs } from "@/lib/timing/frames";
import { resolveTrackTiming } from "@/lib/finishing/audio-track-timing";
import { getFfmpegPathSetting } from "@/lib/services/settings";

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

function configureFfmpeg(customPath?: string | null): void {
  if (customPath) {
    ffmpeg.setFfmpegPath(customPath);
    const ffprobePath = customPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
    if (fs.existsSync(ffprobePath)) {
      ffmpeg.setFfprobePath(ffprobePath);
    }
  }
}

function runFfmpeg(
  command: ffmpeg.FfmpegCommand,
  options?: {
    onProgress?: (progress: ffmpeg.FfmpegProgress) => void;
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
  fps: number
): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(
    ffmpeg(inputPath)
      .setStartTime(startSec)
      .setDuration(durationSec)
      .outputOptions(["-r", String(fps), "-vsync", "cfr"])
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

export async function runExport(
  projectId: string,
  settings: ExportSettings = {},
  onProgress?: ExportProgressCallback
): Promise<string> {
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

  configureFfmpeg(await getFfmpegPathSetting());

  const fps = settings.fps ?? project.defaultFps;
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

      const clipPath = path.join(scratchDir, `clip-${String(i).padStart(3, "0")}.mp4`);
      await trimClip(sourcePath, clipPath, startSec, durationSec, fps);
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

    await report({
      progress: 0.52,
      message: "Encoding video…",
      currentFrame: processedFrames,
      totalFrames,
    });

    let concatFrames = 0;
    await runFfmpeg(
      ffmpeg()
        .input(listFile)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions([
          "-r",
          String(fps),
          "-vsync",
          "cfr",
          "-c:v",
          settings.videoCodec ?? (format === "webm" ? "libvpx-vp9" : "libx264"),
          ...(settings.crf != null ? ["-crf", String(settings.crf)] : []),
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

    if (settings.includeAudio) {
      const audioTracks = db
        .select()
        .from(schema.audioTracks)
        .where(eq(schema.audioTracks.projectId, projectId))
        .all()
        .filter((track) => {
          if (!track.filePath || track.filePath.includes("pending")) return false;
          return fs.existsSync(path.join(projectRoot, track.filePath));
        });

      if (audioTracks.length > 0) {
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
        const totalTimelineFrames = shots.reduce(
          (sum, shot) => sum + shot.durationFrames,
          0
        );

        for (const track of audioTracks) {
          const trackPath = path.join(projectRoot, track.filePath);
          const timing = resolveTrackTiming(track, shots, totalTimelineFrames);
          const startSec = durationMs(timing.startFrame, fps) / 1000;
          const durationSec = durationMs(timing.durationFrames, fps) / 1000;
          command = command.input(trackPath).inputOptions([
            "-ss",
            String(startSec),
            "-t",
            String(durationSec),
          ]);
        }

        await runFfmpeg(
          command
            .complexFilter([
              {
                filter: "amix",
                options: {
                  inputs: audioTracks.length,
                  duration: "first",
                },
                outputs: "aout",
              },
            ])
            .outputOptions([
              "-map",
              "0:v:0",
              "-map",
              "[aout]",
              "-shortest",
              "-t",
              String(videoDuration),
              "-c:a",
              settings.audioCodec ?? "aac",
            ])
            .output(withAudioPath)
        );

        fs.unlinkSync(outputAbsolute);
        finalOutput = withAudioPath;
      }
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

    return path.relative(projectRoot, finalOutput).replace(/\\/g, "/");
  } finally {
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  }
}
