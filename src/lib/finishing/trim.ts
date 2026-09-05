export type TrimValues = {
  trimInFrames: number;
  trimOutFrames: number;
};

export function clampTrim(
  durationFrames: number,
  trimInFrames: number,
  trimOutFrames: number | null
): TrimValues {
  const max = Math.max(1, durationFrames);
  let trimOut = Math.round(trimOutFrames ?? max);
  let trimIn = Math.round(trimInFrames);

  trimOut = Math.max(1, Math.min(trimOut, max));
  trimIn = Math.max(0, Math.min(trimIn, max - 1));

  if (trimIn >= trimOut) {
    trimIn = Math.max(0, trimOut - 1);
  }

  if (trimOut - trimIn < 1) {
    trimOut = Math.min(max, trimIn + 1);
  }

  return { trimInFrames: trimIn, trimOutFrames: trimOut };
}

export function effectiveTrimFrames(
  trimInFrames: number,
  trimOutFrames: number
): number {
  return Math.max(0, trimOutFrames - trimInFrames);
}

export function validateTrim(
  durationFrames: number,
  trimInFrames: number,
  trimOutFrames: number
): string | null {
  if (trimInFrames < 0) return "In cannot be negative";
  if (trimOutFrames > durationFrames) return "Out exceeds shot length";
  if (trimInFrames >= trimOutFrames) return "Out must be after in";
  if (effectiveTrimFrames(trimInFrames, trimOutFrames) < 1) {
    return "Need at least 1 frame";
  }
  return null;
}

export function framesFromClipDelta(
  deltaPx: number,
  pixelsPerFrame: number
): number {
  if (pixelsPerFrame <= 0) return 0;
  return Math.round(deltaPx / pixelsPerFrame);
}

/**
 * Frame to preview when a trim edge changes, relative to the trimmed
 * timeline (0 = the shot's trim-in point).
 */
export function trimPreviewFrameInShot(
  durationFrames: number,
  trimInFrames: number,
  trimOutFrames: number,
  edge: "in" | "out"
): number {
  if (edge === "in") return 0;
  const span = effectiveTrimFrames(
    Math.max(0, trimInFrames),
    Math.min(trimOutFrames, durationFrames)
  );
  return Math.max(0, span - 1);
}
