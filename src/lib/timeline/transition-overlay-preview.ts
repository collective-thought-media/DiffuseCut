import type { TimelineClip } from "@/lib/timeline/types";
import type { TimelineClipLayout } from "@/lib/timeline/video-layout";

export type FadeWipeOverlay =
  | {
      type: "fade";
      color: "black" | "white";
      opacity: number;
    }
  | {
      type: "wipe";
      color: "black";
      opacity: number;
      widthPercent: number;
      side: "left" | "right";
    };

/** Fade / wipe preview overlay for the primary clip at the playhead (AIMovie model). */
export function computeTransitionOverlay(options: {
  fps: number;
  playheadFrame: number;
  layout: TimelineClipLayout;
}): FadeWipeOverlay | null {
  const { fps, playheadFrame, layout } = options;
  const clip = layout.clip;
  const clipDurationSec = (layout.endFrame - layout.startFrame) / fps;
  const timeInClipSec = (playheadFrame - layout.startFrame) / fps;

  const tin = clip.transitionIn;
  if (
    tin &&
    (tin.type === "fade_black" || tin.type === "fade_white") &&
    timeInClipSec < tin.durationSeconds
  ) {
    const progress = timeInClipSec / tin.durationSeconds;
    return {
      type: "fade",
      color: tin.type === "fade_white" ? "white" : "black",
      opacity: 1 - progress,
    };
  }

  const tout = clip.transitionOut;
  if (
    tout &&
    (tout.type === "fade_black" || tout.type === "fade_white")
  ) {
    const timeFromEnd = clipDurationSec - timeInClipSec;
    if (timeFromEnd < tout.durationSeconds) {
      const progress = timeFromEnd / tout.durationSeconds;
      return {
        type: "fade",
        color: tout.type === "fade_white" ? "white" : "black",
        opacity: 1 - progress,
      };
    }
  }

  if (
    tin &&
    (tin.type === "wipe_left" || tin.type === "wipe_right") &&
    timeInClipSec < tin.durationSeconds
  ) {
    const progress = timeInClipSec / tin.durationSeconds;
    return {
      type: "wipe",
      color: "black",
      opacity: 1,
      widthPercent: (1 - progress) * 100,
      side: tin.type === "wipe_left" ? "left" : "right",
    };
  }

  if (
    tout &&
    (tout.type === "wipe_left" || tout.type === "wipe_right")
  ) {
    const timeFromEnd = clipDurationSec - timeInClipSec;
    if (timeFromEnd < tout.durationSeconds) {
      const progress = timeFromEnd / tout.durationSeconds;
      return {
        type: "wipe",
        color: "black",
        opacity: 1,
        widthPercent: (1 - progress) * 100,
        side: tout.type === "wipe_left" ? "left" : "right",
      };
    }
  }

  return null;
}

export function dissolveOffsetSecondsAtCut(
  prevClip: TimelineClip,
  nextClip: TimelineClip
): number {
  if (
    prevClip.transitionOut?.type === "dissolve" &&
    nextClip.transitionIn?.type === "dissolve"
  ) {
    return prevClip.transitionOut.durationSeconds ?? 0;
  }
  return 0;
}
