/**
 * Pure helpers that build ffmpeg filter strings for the export pipeline.
 * Kept free of fs/db so they are easy to unit test.
 */

/** Streaming-friendly loudness target for the final export mix. */
export const EXPORT_LOUDNORM_FILTER = "loudnorm=I=-14:TP=-1.5:LRA=11";

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
}): { width: number; height: number } | null {
  const width = Number(settings.videoWidth);
  const height = Number(settings.videoHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 64 ||
    height < 64
  ) {
    return null;
  }
  return { width: Math.round(width), height: Math.round(height) };
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
