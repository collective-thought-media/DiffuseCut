import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { resolveFfmpegBinary } from "@/lib/services/ffmpeg-path";
import { getFfmpegPathSetting } from "@/lib/services/settings";
import { readImageDimensions } from "@/lib/services/image-dimensions";

export type PunchInFocus =
  | "center"
  | "left"
  | "right"
  | "upper_center"
  | "lower_center";

export type PunchInOptions = {
  zoom: number;
  focus?: PunchInFocus;
};

export type PunchInCropBox = {
  width: number;
  height: number;
  x: number;
  y: number;
  outWidth: number;
  outHeight: number;
};

/** Clamp zoom so we always crop a real sub-rectangle, not a no-op or invert. */
export function normalizePunchInZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1.5;
  return Math.min(4, Math.max(1.15, zoom));
}

/**
 * Optical punch-in: crop a same-aspect window from the establishing plate,
 * then scale that window back to the original pixel size. No diffusion.
 */
export function computePunchInCropBox(
  sourceWidth: number,
  sourceHeight: number,
  options: PunchInOptions
): PunchInCropBox {
  if (sourceWidth < 8 || sourceHeight < 8) {
    throw new Error("Source image is too small to punch in");
  }
  const zoom = normalizePunchInZoom(options.zoom);
  const focus = options.focus ?? "center";
  const width = Math.max(8, Math.round(sourceWidth / zoom));
  const height = Math.max(8, Math.round(sourceHeight / zoom));
  const maxX = Math.max(0, sourceWidth - width);
  const maxY = Math.max(0, sourceHeight - height);

  let x = Math.round(maxX / 2);
  let y = Math.round(maxY / 2);
  if (focus === "left") x = 0;
  if (focus === "right") x = maxX;
  if (focus === "upper_center") y = Math.round(maxY * 0.2);
  if (focus === "lower_center") y = Math.round(maxY * 0.8);

  return {
    width,
    height,
    x,
    y,
    outWidth: sourceWidth,
    outHeight: sourceHeight,
  };
}

export function buildPunchInFilter(box: PunchInCropBox): string {
  return `crop=${box.width}:${box.height}:${box.x}:${box.y},scale=${box.outWidth}:${box.outHeight}:flags=lanczos`;
}

async function configureFfmpeg(customPath?: string | null): Promise<void> {
  const resolved = await resolveFfmpegBinary(customPath);
  if (!resolved || resolved === "ffmpeg") return;
  ffmpeg.setFfmpegPath(resolved);
  const ffprobePath = resolved.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
  if (fs.existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
  }
}

/** Crop+scale an establishing plate into a closer plate on disk. */
export async function punchInImage(
  sourceAbs: string,
  destAbs: string,
  options: PunchInOptions
): Promise<PunchInCropBox> {
  const dims = readImageDimensions(sourceAbs);
  if (!dims) {
    throw new Error("Could not read establishing image dimensions");
  }
  const box = computePunchInCropBox(dims.width, dims.height, options);
  const filter = buildPunchInFilter(box);

  const ffmpegPath = await getFfmpegPathSetting();
  await configureFfmpeg(ffmpegPath);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  if (fs.existsSync(destAbs)) {
    fs.unlinkSync(destAbs);
  }

  await new Promise<void>((resolve, reject) => {
    ffmpeg(sourceAbs)
      .outputOptions(["-frames:v", "1"])
      .videoFilters(filter)
      .output(destAbs)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  return box;
}
