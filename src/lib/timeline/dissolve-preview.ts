import type { TimelineClip, TimelineTrack } from "@/lib/timeline/types";
import type { TimelineClipLayout } from "@/lib/timeline/video-layout";
import { mediaTimeSecForTimelineFrame } from "@/lib/timeline/video-layout";

export type DissolveOverlaySide = {
  src: string;
  clipId: string;
  groupId: string | null;
  timeSeconds: number;
  audioSrc: string;
  audioTimeSeconds: number;
  opacity: number;
  active: boolean;
};

export type DissolvePreviewState = {
  prev: DissolveOverlaySide;
  next: DissolveOverlaySide;
  active: boolean;
  tRelSeconds: number;
  cutFrame: number;
};

function smoothstep01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function clipDurationSec(layout: TimelineClipLayout, fps: number): number {
  return (layout.endFrame - layout.startFrame) / fps;
}

function findLinkedAudio(
  audioTracks: TimelineTrack[],
  groupId: string | null,
  fallbackSrc: string,
  fallbackTrimInSec: number,
  fps: number
): { src: string; trimInSec: number } {
  if (!groupId) return { src: fallbackSrc, trimInSec: fallbackTrimInSec };
  for (const track of audioTracks) {
    const ac = track.clips.find(
      (c) => c.groupId === groupId && c.sourceUrl.length > 0
    );
    if (ac) {
      return {
        src: ac.sourceUrl,
        trimInSec: ac.trimInFrames / fps,
      };
    }
  }
  return { src: fallbackSrc, trimInSec: fallbackTrimInSec };
}

/** Cross-dissolve preview state (AIMovieStudiov2 overlap model), frame-based playhead. */
export function computeDissolvePreview(options: {
  fps: number;
  playheadFrame: number;
  v1Layout: TimelineClipLayout[];
  audioTracks: TimelineTrack[];
}): DissolvePreviewState | null {
  const { fps, playheadFrame, v1Layout, audioTracks } = options;
  if (!v1Layout.length) return null;

  const playheadSec = playheadFrame / fps;
  const layoutHit = v1Layout.find(
    (l) => playheadFrame >= l.startFrame && playheadFrame < l.endFrame
  );
  if (!layoutHit) return null;

  const clip = layoutHit.clip;
  const idx = v1Layout.findIndex((l) => l.clip.id === clip.id);
  if (idx < 0) return null;

  const findJunction = (): {
    prevClip: TimelineClip;
    nextClip: TimelineClip;
    prevLayout: TimelineClipLayout;
    nextLayout: TimelineClipLayout;
  } | null => {
    if (
      clip.transitionOut?.type === "dissolve" &&
      idx < v1Layout.length - 1
    ) {
      const nextLayout = v1Layout[idx + 1]!;
      const nextClip = nextLayout.clip;
      if (nextClip.transitionIn?.type === "dissolve") {
        return { prevClip: clip, nextClip, prevLayout: layoutHit, nextLayout };
      }
    }
    if (clip.transitionIn?.type === "dissolve" && idx > 0) {
      const prevLayout = v1Layout[idx - 1]!;
      const prevClip = prevLayout.clip;
      if (prevClip.transitionOut?.type === "dissolve") {
        return { prevClip, nextClip: clip, prevLayout, nextLayout: layoutHit };
      }
    }
    return null;
  };

  const j = findJunction();
  if (!j?.prevClip.sourceUrl || !j.nextClip.sourceUrl) return null;

  const prevDur = clipDurationSec(j.prevLayout, fps);
  const nextDur = clipDurationSec(j.nextLayout, fps);
  const outDur = Math.max(
    0.1,
    Math.min(j.prevClip.transitionOut?.durationSeconds ?? 0, prevDur)
  );
  const inDur = Math.max(
    0.1,
    Math.min(j.nextClip.transitionIn?.durationSeconds ?? 0, nextDur)
  );
  const total = Math.max(0.001, outDur + inDur);

  const postHoldSeconds = 0.12;
  const preloadMarginSeconds = 0.6;

  const cutTimeSec = j.prevLayout.endFrame / fps;
  const tRel = playheadSec - cutTimeSec;

  if (tRel < -outDur - preloadMarginSeconds) return null;
  if (tRel > inDur + postHoldSeconds + preloadMarginSeconds) return null;

  const mix = smoothstep01((tRel + outDur) / total);
  const prevOpacity = 1 - mix;
  const nextOpacity = mix;

  const prevTrimInSec = j.prevClip.trimInFrames / fps;
  const nextTrimInSec = j.nextClip.trimInFrames / fps;

  const prevGroupId =
    typeof j.prevClip.groupId === "string" ? j.prevClip.groupId : null;
  const nextGroupId =
    typeof j.nextClip.groupId === "string" ? j.nextClip.groupId : null;

  const prevWindowStart = Math.max(0, prevDur - outDur);
  const tOverlap = tRel + outDur;
  const prevTimeIn = Math.max(0, Math.min(prevDur - 0.01, prevWindowStart + tOverlap));
  const nextTimeIn = Math.max(0, Math.min(nextDur - 0.01, tOverlap));

  const active = tRel >= -outDur && tRel <= inDur + postHoldSeconds;

  const prevAudio = findLinkedAudio(
    audioTracks,
    prevGroupId,
    j.prevClip.sourceUrl,
    prevTrimInSec,
    fps
  );
  const nextAudio = findLinkedAudio(
    audioTracks,
    nextGroupId,
    j.nextClip.sourceUrl,
    nextTrimInSec,
    fps
  );

  return {
    prev: {
      src: j.prevClip.sourceUrl,
      clipId: j.prevClip.id,
      groupId: prevGroupId,
      timeSeconds: prevTrimInSec + prevTimeIn,
      audioSrc: prevAudio.src,
      audioTimeSeconds: prevAudio.trimInSec + prevTimeIn,
      opacity: prevOpacity,
      active,
    },
    next: {
      src: j.nextClip.sourceUrl,
      clipId: j.nextClip.id,
      groupId: nextGroupId,
      timeSeconds: nextTrimInSec + nextTimeIn,
      audioSrc: nextAudio.src,
      audioTimeSeconds: nextAudio.trimInSec + nextTimeIn,
      opacity: nextOpacity,
      active,
    },
    active,
    tRelSeconds: tRel,
    cutFrame: j.prevLayout.endFrame,
  };
}

export function primaryLayoutAtFrame(
  v1Layout: TimelineClipLayout[],
  frame: number
): TimelineClipLayout | null {
  return (
    v1Layout.find((l) => frame >= l.startFrame && frame < l.endFrame) ?? null
  );
}

export function mediaTimeSecForLayoutFrame(
  layout: TimelineClipLayout,
  frame: number,
  fps: number
): number {
  return mediaTimeSecForTimelineFrame(layout.clip, frame, fps);
}
