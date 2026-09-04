import type { Shot } from "@/lib/db/schema";
import { frameAtTimelinePosition, shotStartFrame } from "@/lib/timing/frames";

export function shotVideoTimeSec(
  shot: Shot,
  frameInShot: number,
  fps: number
): number {
  const trimIn = shot.trimInFrames ?? 0;
  const trimOut = shot.trimOutFrames ?? shot.durationFrames;
  const trimSpan = Math.max(1, trimOut - trimIn);
  const durationFrames = Math.max(1, shot.durationFrames);
  const ratio = Math.min(1, Math.max(0, frameInShot / durationFrames));
  return (trimIn + ratio * trimSpan) / fps;
}

export function frameInShotFromVideoTime(
  shots: Shot[],
  shotIndex: number,
  videoTimeSec: number,
  fps: number
): number {
  const shot = shots[shotIndex];
  if (!shot) return 0;

  const trimIn = shot.trimInFrames ?? 0;
  const trimOut = shot.trimOutFrames ?? shot.durationFrames;
  const trimSpan = Math.max(1, trimOut - trimIn);
  const videoFrame = videoTimeSec * fps;
  const clamped = Math.min(trimOut, Math.max(trimIn, videoFrame));
  const ratio = (clamped - trimIn) / trimSpan;
  return Math.round(ratio * Math.max(1, shot.durationFrames - 1));
}

export function globalFrameFromVideoTime(
  shots: Shot[],
  shotIndex: number,
  videoTimeSec: number,
  fps: number
): number {
  return (
    shotStartFrame(shots, shotIndex) +
    frameInShotFromVideoTime(shots, shotIndex, videoTimeSec, fps)
  );
}

export function isVideoAtShotEnd(
  shot: Shot,
  videoTimeSec: number,
  fps: number,
  videoDurationSec?: number | null
): boolean {
  const trimIn = shot.trimInFrames ?? 0;
  const trimOut = shot.trimOutFrames ?? shot.durationFrames;
  const trimEndSec = trimOut / fps;

  if (videoDurationSec != null && Number.isFinite(videoDurationSec) && videoDurationSec > 0) {
    const effectiveEndSec = Math.min(trimEndSec, videoDurationSec);
    const trimStartSec = trimIn / fps;
    if (videoTimeSec >= effectiveEndSec - 0.5 / fps) {
      return true;
    }
    if (videoTimeSec >= videoDurationSec - 0.5 / fps && videoTimeSec >= trimStartSec) {
      return true;
    }
    return false;
  }

  return videoTimeSec * fps >= trimOut - 0.5 / fps;
}

export function activeOverlayTexts(
  overlays: Array<{ text: string; startFrame: number; endFrame: number }>,
  currentFrame: number
): string[] {
  return overlays
    .filter(
      (overlay) =>
        currentFrame >= overlay.startFrame && currentFrame < overlay.endFrame
    )
    .map((overlay) => overlay.text);
}

export function frameAtTimelinePositionSafe(
  shots: Shot[],
  frame: number
): { shotIndex: number; frameInShot: number } {
  if (shots.length === 0) return { shotIndex: 0, frameInShot: 0 };
  return frameAtTimelinePosition(shots, frame);
}
