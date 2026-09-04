/** Frame-count transforms for video latent nodes (model-specific rules). */

export type FrameCountTransform = "none" | "ltx_8n1" | "minimax_17k5";

/** LTX EmptyLTXVLatentVideo requires length = 8n + 1. */
export function ltxLengthFromDurationFrames(durationFrames: number): number {
  const target = durationFrames + 1;
  const n = Math.max(0, Math.round((target - 1) / 8));
  return 8 * n + 1;
}

/** MiniMax H3 snaps frame count to the 17k+5 grid (124, 141, ...). */
export function minimaxH3LengthFromDurationFrames(durationFrames: number): number {
  let length = Math.max(5, durationFrames);
  while (length % 17 !== 5) {
    length += 1;
  }
  return length;
}

export function applyFrameCountTransform(
  durationFrames: number,
  transform: FrameCountTransform | undefined
): number {
  if (transform === "ltx_8n1") {
    return ltxLengthFromDurationFrames(durationFrames);
  }
  if (transform === "minimax_17k5") {
    return minimaxH3LengthFromDurationFrames(durationFrames);
  }
  return durationFrames;
}
