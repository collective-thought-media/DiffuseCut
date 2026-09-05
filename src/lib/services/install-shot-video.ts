import path from "path";
import { and, eq } from "drizzle-orm";
import ffmpeg from "fluent-ffmpeg";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { resolveProjectRoot } from "@/lib/paths/project-paths";
import {
  conformVideoToExactSize,
  isVideoRenderFile,
} from "@/lib/services/ffmpeg-export";
import { saveFileToProject } from "@/lib/services/file-manager";
import {
  mediaKindFromExtension,
  sanitizeFileName,
} from "@/lib/services/media-import";
import {
  resolveOutputFrameSize,
} from "@/lib/services/export-filters";
import { parseProjectRenderSettings } from "@/lib/services/render-settings-resolver";
import { getFfmpegPathSetting } from "@/lib/services/settings";
import { nowMs } from "@/lib/utils";

function configureFfmpeg(customPath?: string | null): void {
  if (customPath) {
    ffmpeg.setFfmpegPath(customPath);
    const ffprobePath = customPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
    ffmpeg.setFfprobePath(ffprobePath);
  }
}

function probeDurationFrames(
  filePath: string,
  fallbackFps: number
): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(null);
        return;
      }
      const video = (metadata.streams ?? []).find(
        (stream) => stream.codec_type === "video"
      );
      const frames = Number(video?.nb_frames);
      if (Number.isFinite(frames) && frames > 0) {
        resolve(Math.round(frames));
        return;
      }
      const duration = metadata.format.duration ?? 0;
      if (duration > 0) {
        resolve(Math.max(1, Math.round(duration * fallbackFps)));
        return;
      }
      resolve(null);
    });
  });
}

export async function installShotRenderVideo(options: {
  projectId: string;
  shotId: string;
  buffer: Buffer;
  fileName: string;
}) {
  const kind = mediaKindFromExtension(options.fileName);
  if (kind !== "video") {
    throw new Error("Install clip needs a video file.");
  }

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, options.projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const shot = db
    .select()
    .from(schema.shots)
    .where(
      and(
        eq(schema.shots.id, options.shotId),
        eq(schema.shots.projectId, options.projectId)
      )
    )
    .get();
  if (!shot) throw new Error("Shot not found");

  const projectRoot = resolveProjectRoot(project);
  const safeName = sanitizeFileName(options.fileName);
  const ext = path.extname(safeName) || ".mp4";
  const storedName = `${options.shotId}-${nanoid(8)}${ext}`;
  const relativePath = saveFileToProject(
    projectRoot,
    "renders",
    storedName,
    options.buffer
  );
  const absolutePath = path.join(projectRoot, relativePath);

  configureFfmpeg(await getFfmpegPathSetting());
  const fps = shot.fps ?? project.defaultFps ?? 24;
  const durationFrames =
    (await probeDurationFrames(absolutePath, fps)) ?? shot.durationFrames;

  const frameSize = resolveOutputFrameSize(
    parseProjectRenderSettings(project.renderSettingsJson)
  );
  if (frameSize && isVideoRenderFile(absolutePath)) {
    await conformVideoToExactSize(
      absolutePath,
      frameSize.width,
      frameSize.height
    );
  }

  const ts = nowMs();
  db.update(schema.shots)
    .set({
      videoPath: relativePath,
      renderStatus: "done",
      durationFrames,
      trimInFrames: 0,
      trimOutFrames: null,
      updatedAt: ts,
    })
    .where(eq(schema.shots.id, options.shotId))
    .run();

  const updated = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, options.shotId))
    .get()!;

  return { shot: updated, relativePath };
}
