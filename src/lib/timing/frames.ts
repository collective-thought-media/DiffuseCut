export function durationMs(frames: number, fps: number): number {
  return Math.round((frames * 1000) / fps);
}

export function framesFromMs(ms: number, fps: number): number {
  return Math.round((ms * fps) / 1000);
}

export function frameDurationMs(fps: number): number {
  return 1000 / fps;
}

export function totalProjectFrames(
  shots: { durationFrames: number }[]
): number {
  return shots.reduce((sum, s) => sum + s.durationFrames, 0);
}

export function snapFrames(frames: number, min = 1): number {
  return Math.max(min, Math.round(frames));
}

export function formatFrameLabel(frames: number, fps: number): string {
  const ms = durationMs(frames, fps);
  const sec = (ms / 1000).toFixed(2);
  return `${frames} frames ≈ ${sec}s @ ${fps}fps`;
}

export function frameAtTimelinePosition(
  shots: { durationFrames: number }[],
  frame: number
): { shotIndex: number; frameInShot: number } {
  let acc = 0;
  for (let i = 0; i < shots.length; i++) {
    const dur = shots[i].durationFrames;
    if (frame < acc + dur) {
      return { shotIndex: i, frameInShot: frame - acc };
    }
    acc += dur;
  }
  if (shots.length === 0) return { shotIndex: 0, frameInShot: 0 };
  const last = shots.length - 1;
  return { shotIndex: last, frameInShot: shots[last].durationFrames };
}

export function shotStartFrame(
  shots: { durationFrames: number }[],
  shotIndex: number
): number {
  return shots
    .slice(0, shotIndex)
    .reduce((sum, shot) => sum + shot.durationFrames, 0);
}

const TIMELINE_GAP_PX = 6;
const TIMELINE_MIN_CLIP_WIDTH = 48;

export function timelineClipWidthPx(
  durationFrames: number,
  pixelsPerFrame: number,
  minClipWidth = TIMELINE_MIN_CLIP_WIDTH
): number {
  return Math.max(durationFrames * pixelsPerFrame, minClipWidth);
}

export function timelineTotalWidthPx(
  shots: { durationFrames: number }[],
  pixelsPerFrame: number,
  gapPx = TIMELINE_GAP_PX,
  minClipWidth = TIMELINE_MIN_CLIP_WIDTH
): number {
  if (shots.length === 0) return 0;
  const clipWidths = shots.reduce(
    (sum, shot) =>
      sum + timelineClipWidthPx(shot.durationFrames, pixelsPerFrame, minClipWidth),
    0
  );
  return clipWidths + gapPx * Math.max(shots.length - 1, 0);
}

export function timelinePlayheadOffsetPx(
  shots: { durationFrames: number }[],
  frame: number,
  pixelsPerFrame: number,
  gapPx = TIMELINE_GAP_PX,
  minClipWidth = TIMELINE_MIN_CLIP_WIDTH
): number {
  if (shots.length === 0) return 0;

  const { shotIndex, frameInShot } = frameAtTimelinePosition(shots, frame);
  let offset = 0;

  for (let i = 0; i < shotIndex; i++) {
    offset +=
      timelineClipWidthPx(
        shots[i].durationFrames,
        pixelsPerFrame,
        minClipWidth
      ) + gapPx;
  }

  const clipWidth = timelineClipWidthPx(
    shots[shotIndex].durationFrames,
    pixelsPerFrame,
    minClipWidth
  );
  const shotDuration = Math.max(shots[shotIndex].durationFrames, 1);
  offset += (frameInShot / shotDuration) * clipWidth;

  return offset;
}

/** Translate the clip track so the playhead stays centered in the viewport. */
export function timelineTrackTranslatePx(
  playheadOffsetPx: number,
  viewportWidthPx: number
): number {
  return viewportWidthPx / 2 - playheadOffsetPx;
}
