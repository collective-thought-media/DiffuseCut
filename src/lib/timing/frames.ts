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

/**
 * Trim-aware timeline math for finishing and export. The storyboard plans in
 * full shot durations (helpers above); once trims are set on the finishing
 * page, each shot only contributes its trimmed span to the timeline, matching
 * the exported video exactly.
 */
export interface TrimmableShot {
  durationFrames: number;
  trimInFrames?: number | null;
  trimOutFrames?: number | null;
}

/** Frames a shot contributes to the trimmed finishing/export timeline. */
export function shotTimelineFrames(shot: TrimmableShot): number {
  const trimIn = shot.trimInFrames ?? 0;
  const trimOut = shot.trimOutFrames ?? shot.durationFrames;
  return Math.max(1, trimOut - trimIn);
}

/** Total frames on the trimmed finishing/export timeline. */
export function totalTimelineFrames(shots: TrimmableShot[]): number {
  return shots.reduce((sum, shot) => sum + shotTimelineFrames(shot), 0);
}

/**
 * Position on the trimmed timeline. frameInShot is relative to the trim
 * window: 0 is the shot's trim-in point.
 */
export function frameAtTrimmedTimelinePosition(
  shots: TrimmableShot[],
  frame: number
): { shotIndex: number; frameInShot: number } {
  let acc = 0;
  for (let i = 0; i < shots.length; i++) {
    const dur = shotTimelineFrames(shots[i]);
    if (frame < acc + dur) {
      return { shotIndex: i, frameInShot: frame - acc };
    }
    acc += dur;
  }
  if (shots.length === 0) return { shotIndex: 0, frameInShot: 0 };
  const last = shots.length - 1;
  return { shotIndex: last, frameInShot: shotTimelineFrames(shots[last]) };
}

/** Start frame of a shot on the trimmed timeline. */
export function trimmedShotStartFrame(
  shots: TrimmableShot[],
  shotIndex: number
): number {
  return shots
    .slice(0, shotIndex)
    .reduce((sum, shot) => sum + shotTimelineFrames(shot), 0);
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

/**
 * Playhead pixel offset on the finishing clip strip. Clips render at their
 * full (untrimmed) width with the trim window marked inside them, so a frame
 * on the trimmed timeline maps to its pixel position inside the owning clip's
 * trim window; trimmed-away regions are skipped.
 */
export function timelineTrimmedPlayheadOffsetPx(
  shots: TrimmableShot[],
  frame: number,
  pixelsPerFrame: number,
  gapPx = TIMELINE_GAP_PX,
  minClipWidth = TIMELINE_MIN_CLIP_WIDTH
): number {
  if (shots.length === 0) return 0;

  const { shotIndex, frameInShot } = frameAtTrimmedTimelinePosition(
    shots,
    frame
  );
  let offset = 0;

  for (let i = 0; i < shotIndex; i++) {
    offset +=
      timelineClipWidthPx(
        shots[i].durationFrames,
        pixelsPerFrame,
        minClipWidth
      ) + gapPx;
  }

  const shot = shots[shotIndex];
  const clipWidth = timelineClipWidthPx(
    shot.durationFrames,
    pixelsPerFrame,
    minClipWidth
  );
  const trimIn = shot.trimInFrames ?? 0;
  const duration = Math.max(1, shot.durationFrames);
  offset += ((trimIn + frameInShot) / duration) * clipWidth;

  return offset;
}

/** Translate the clip track so the playhead stays centered in the viewport. */
export function timelineTrackTranslatePx(
  playheadOffsetPx: number,
  viewportWidthPx: number
): number {
  return viewportWidthPx / 2 - playheadOffsetPx;
}
