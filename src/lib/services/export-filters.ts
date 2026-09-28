/**
 * Pure helpers that build ffmpeg filter strings for the export pipeline.
 * Kept free of fs/db so they are easy to unit test.
 */

import { alignVideoSizeToReferenceAspect } from "@/lib/services/reference-aspect-ratio";

/** Streaming-friendly loudness target for the final export mix. */
export const EXPORT_LOUDNORM_FILTER = "loudnorm=I=-14:TP=-1.5:LRA=11";

/**
 * Delivery floor is 25 Mbps at 1920x1080. x264 CBR lands a hair under its
 * target in the container, so encode at 26 Mbps to stay above the floor.
 */
export const EXPORT_VIDEO_TARGET_KBPS_1080P = 26000;
const PIXELS_1080P = 1920 * 1080;

/** Constant video bitrate scaled by frame area from the 1080p target. */
export function resolveExportVideoBitrateKbps(
  frameSize: { width: number; height: number } | null
): number {
  if (!frameSize) return EXPORT_VIDEO_TARGET_KBPS_1080P;
  const area = frameSize.width * frameSize.height;
  return Math.ceil((EXPORT_VIDEO_TARGET_KBPS_1080P * area) / PIXELS_1080P);
}

/** Constant-bitrate rate control for libx264 or libvpx-vp9 delivery encodes. */
export function buildExportVideoRateOptions(
  codec: string,
  frameSize: { width: number; height: number } | null
): string[] {
  const rate = `${resolveExportVideoBitrateKbps(frameSize)}k`;
  const options = [
    "-b:v",
    rate,
    "-minrate",
    rate,
    "-maxrate",
    rate,
    "-bufsize",
    rate,
    "-pix_fmt",
    "yuv420p",
  ];
  if (codec === "libx264") {
    options.push("-x264-params", "nal-hrd=cbr");
  }
  return options;
}

/**
 * Cover-and-crop a clip to an exact frame size so the deliverable matches
 * the project output width and height, even when a model wrote a nearby size.
 */
export function buildExactSizeVideoFilter(
  width: number,
  height: number
): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

export function resolveOutputFrameSize(settings: {
  videoWidth?: number;
  videoHeight?: number;
  referenceAspectRatio?: string | null;
}): { width: number; height: number } | null {
  const rawWidth = Number(settings.videoWidth);
  const rawHeight = Number(settings.videoHeight);
  const widthProvided =
    settings.videoWidth != null && Number.isFinite(rawWidth);
  const heightProvided =
    settings.videoHeight != null && Number.isFinite(rawHeight);
  if (widthProvided !== heightProvided) return null;
  if (widthProvided && heightProvided && (rawWidth < 64 || rawHeight < 64)) {
    return null;
  }

  const aligned = alignVideoSizeToReferenceAspect({
    referenceAspectRatio: settings.referenceAspectRatio,
    videoWidth: widthProvided ? rawWidth : null,
    videoHeight: heightProvided ? rawHeight : null,
  });
  return {
    width: Math.round(aligned.videoWidth),
    height: Math.round(aligned.videoHeight),
  };
}

/**
 * Escape a user string for use inside a single-quoted drawtext text value
 * within an ffmpeg filtergraph.
 */
export function escapeDrawtextText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/:/g, "\\:")
    .replace(/'/g, "'\\''");
}

/** Escape a filesystem path for a drawtext fontfile argument. */
export function escapeDrawtextFontPath(fontPath: string): string {
  return fontPath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

export interface OverlayDrawtextInput {
  text: string;
  /** Timeline-global start frame on the trimmed timeline. */
  startFrame: number;
  /** Timeline-global end frame (exclusive) on the trimmed timeline. */
  endFrame: number;
}

function frameToSeconds(frame: number, fps: number): string {
  return (frame / fps).toFixed(3);
}

/**
 * Build one drawtext filter per overlay, styled to match the finishing
 * preview: white bold text in a black 70% box, centered, at 25% height.
 */
export function buildOverlayDrawtextFilters(
  overlays: OverlayDrawtextInput[],
  fps: number,
  fontFilePath: string
): string[] {
  const fontfile = escapeDrawtextFontPath(fontFilePath);
  return overlays
    .filter((overlay) => overlay.text.trim().length > 0)
    .map((overlay) => {
      const text = escapeDrawtextText(overlay.text.trim());
      const start = frameToSeconds(overlay.startFrame, fps);
      const end = frameToSeconds(overlay.endFrame, fps);
      return [
        `drawtext=fontfile='${fontfile}'`,
        `text='${text}'`,
        "fontcolor=white",
        "fontsize=h/30",
        "box=1",
        "boxcolor=black@0.7",
        "boxborderw=12",
        "x=(w-text_w)/2",
        "y=h*0.25",
        `enable='between(t,${start},${end})'`,
      ].join(":");
    });
}

export interface ExportAudioMixGraph {
  /** Filtergraph entries for ffmpeg complexFilter. */
  filters: string[];
  /** Label of the mixed, loudness-normalized output stream. */
  outputLabel: string;
}

/**
 * Mix the concatenated shot audio (input 0) with timeline audio tracks
 * (inputs 1..n), applying per-track volume and loudness normalization.
 */
export function buildExportAudioMixGraph(
  trackVolumes: number[]
): ExportAudioMixGraph {
  const filters: string[] = [];
  const mixInputs: string[] = ["[0:a:0]"];

  trackVolumes.forEach((volume, index) => {
    const clamped = Math.min(2, Math.max(0, volume));
    const label = `trk${index}`;
    filters.push(`[${index + 1}:a:0]volume=${clamped}[${label}]`);
    mixInputs.push(`[${label}]`);
  });

  filters.push(
    `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first[mixed]`
  );
  filters.push(`[mixed]${EXPORT_LOUDNORM_FILTER}[aout]`);

  return { filters, outputLabel: "aout" };
}
