import type { TimelineClip, TimelineState } from "@/lib/timeline/types";

export function clipEndFrame(clip: TimelineClip): number {
  return clip.startFrame + Math.max(1, clip.durationFrames);
}

export function timelineContentEndFrame(timeline: TimelineState): number {
  let max = 1;
  for (const track of [...timeline.videoTracks, ...timeline.audioTracks]) {
    for (const clip of track.clips) {
      max = Math.max(max, clipEndFrame(clip));
    }
  }
  return max;
}

export type TimelineClipHit = {
  clip: TimelineClip;
  trackId: string;
  trackKind: "video" | "audio";
};

/** First video clip covering `frame` (V1, then V2, V3). */
export function videoClipAtTimelineFrame(
  timeline: TimelineState,
  frame: number
): TimelineClipHit | null {
  for (const track of timeline.videoTracks) {
    for (const clip of track.clips) {
      const end = clipEndFrame(clip);
      if (frame >= clip.startFrame && frame < end) {
        return { clip, trackId: track.id, trackKind: "video" };
      }
    }
  }
  return null;
}

export function frameWithinClip(
  clip: TimelineClip,
  timelineFrame: number
): number {
  const offset = Math.max(0, timelineFrame - clip.startFrame);
  const trimOut =
    clip.trimOutFrames ?? clip.trimInFrames + clip.durationFrames;
  const maxInClip = Math.max(clip.trimInFrames + 1, trimOut);
  return Math.min(clip.trimInFrames + offset, maxInClip - 1);
}
