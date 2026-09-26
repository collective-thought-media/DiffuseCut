import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import ffmpeg from "fluent-ffmpeg";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { Project } from "@/lib/db/schema";
import type { TimelineClip, TimelineState } from "@/lib/timeline/types";
import {
  ensureProjectDirs,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import type {
  ExportProgressCallback,
  ExportResult,
  ExportSettings,
} from "@/lib/services/ffmpeg-export";
import { resolveFfmpegBinary } from "@/lib/services/ffmpeg-path";
import { getFfmpegPathSetting } from "@/lib/services/settings";
import {
  buildExactSizeVideoFilter,
  resolveOutputFrameSize,
} from "@/lib/services/export-filters";
import { parseProjectRenderSettings } from "@/lib/services/render-settings-resolver";

async function configureFfmpeg(customPath?: string | null): Promise<void> {
  const resolved = await resolveFfmpegBinary(customPath);
  if (!resolved || resolved === "ffmpeg") return;
  ffmpeg.setFfmpegPath(resolved);
}

export function clipDurationFrames(clip: TimelineClip, fps: number): number {
  if (clip.trimOutFrames != null && clip.trimOutFrames > clip.trimInFrames) {
    return clip.trimOutFrames - clip.trimInFrames;
  }
  return clip.durationFrames;
}

function resolveClipAbsolutePath(
  projectRoot: string,
  projectId: string,
  clip: TimelineClip
): string | null {
  const db = getDb();
  if (clip.sourceType === "shot") {
    const shot = db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.id, clip.sourceRef))
      .get();
    const rel = shot?.videoPath ?? shot?.placeholderPath;
    if (!rel) return null;
    const abs = path.join(projectRoot, rel);
    return fs.existsSync(abs) ? abs : null;
  }
  if (clip.sourceType === "file" || clip.sourceType === "image") {
    const abs = path.isAbsolute(clip.sourceRef)
      ? clip.sourceRef
      : path.join(projectRoot, clip.sourceRef);
    return fs.existsSync(abs) ? abs : null;
  }
  return null;
}

function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on("end", () => resolve()).on("error", (err) => reject(err)).run();
  });
}

export async function exportFromTimelineState(options: {
  project: Project;
  sequenceId: string;
  timeline: TimelineState;
  settings: ExportSettings;
  onProgress?: ExportProgressCallback;
}): Promise<ExportResult> {
  const { project, timeline, settings, onProgress } = options;
  const fps = settings.fps ?? project.defaultFps;
  const projectRoot = resolveProjectRoot(project);
  const dirs = ensureProjectDirs(project);
  await configureFfmpeg(await getFfmpegPathSetting());

  const frameSize =
    resolveOutputFrameSize(
      parseProjectRenderSettings(project.renderSettingsJson)
    ) ?? { width: 1920, height: 1080 };

  const clips = [...(timeline.videoTracks[0]?.clips ?? [])].sort(
    (a, b) => a.startFrame - b.startFrame
  );

  const segmentPaths: string[] = [];
  let totalFrames = 0;

  for (const clip of clips) {
    const inputPath = resolveClipAbsolutePath(projectRoot, project.id, clip);
    if (!inputPath) continue;
    const durationFrames = clipDurationFrames(clip, fps);
    totalFrames += durationFrames;
    const durationSec = durationFrames / fps;
    const trimStartSec = clip.trimInFrames / fps;
    const scratchDir = path.join(dirs.scratch, "timeline-export", nanoid());
    fs.mkdirSync(scratchDir, { recursive: true });
    const outSegment = path.join(scratchDir, `seg-${segmentPaths.length}.mp4`);
    const vf = buildExactSizeVideoFilter(frameSize.width, frameSize.height);

    await runFfmpeg(
      ffmpeg(inputPath)
        .setStartTime(trimStartSec)
        .setDuration(durationSec)
        .videoFilters(vf)
        .outputOptions([
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          String(settings.crf ?? 18),
          "-pix_fmt",
          "yuv420p",
          "-an",
        ])
        .output(outSegment)
    );
    segmentPaths.push(outSegment);
  }

  if (segmentPaths.length === 0) {
    throw new Error("No exportable clips on the timeline");
  }

  await onProgress?.({
    progress: 0.5,
    message: "Concatenating timeline…",
    currentFrame: 0,
    totalFrames,
  });

  const listFile = path.join(dirs.scratch, "timeline-export", `${nanoid()}.txt`);
  fs.mkdirSync(path.dirname(listFile), { recursive: true });
  fs.writeFileSync(
    listFile,
    segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
  );

  const outputName =
    settings.outputFileName ??
    `export-${Date.now()}-${frameSize.height}p-timeline.mp4`;
  const outputAbsolute = path.join(dirs.exports, outputName);
  fs.mkdirSync(path.dirname(outputAbsolute), { recursive: true });

  await runFfmpeg(
    ffmpeg()
      .input(listFile)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"])
      .output(outputAbsolute)
  );

  const outputPath = path.relative(projectRoot, outputAbsolute).replace(/\\/g, "/");

  await onProgress?.({
    progress: 1,
    message: "Export complete",
    currentFrame: totalFrames,
    totalFrames,
  });

  return {
    outputPath,
    meta: {
      width: frameSize.width,
      height: frameSize.height,
      durationSeconds: totalFrames / fps,
      overlayCount: 0,
      audioSource: settings.includeAudio === false ? "none" : "timeline",
    },
  };
}
