import type { TimelineClip, TimelineState } from "@/lib/timeline/types";
import { clipEndFrame, videoClipAtTimelineFrame } from "@/lib/timeline/playhead";

export type TimelineClipLayout = {
  clip: TimelineClip;
  trackId: string;
  startFrame: number;
  endFrame: number;
};

/** V1 clips in timeline order (primary story track, dissolve playback). */
export function buildPrimaryVideoLayout(
  timeline: TimelineState
): TimelineClipLayout[] {
  const track = timeline.videoTracks[0];
  if (!track) return [];
  return track.clips
    .map((clip) => ({
      clip,
      trackId: track.id,
      startFrame: clip.startFrame,
      endFrame: clipEndFrame(clip),
    }))
    .sort((a, b) => {
      if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
      return a.clip.id.localeCompare(b.clip.id);
    });
}

/** Higher video tracks (V2+) covering `frame`, bottom to top. */
export function overlayVideoLayoutsAtFrame(
  timeline: TimelineState,
  frame: number
): TimelineClipLayout[] {
  const overlays: TimelineClipLayout[] = [];
  for (let ti = 1; ti < timeline.videoTracks.length; ti++) {
    const track = timeline.videoTracks[ti];
    if (!track) continue;
    for (const clip of track.clips) {
      const end = clipEndFrame(clip);
      if (frame >= clip.startFrame && frame < end && isVideoClip(clip)) {
        overlays.push({
          clip,
          trackId: track.id,
          startFrame: clip.startFrame,
          endFrame: end,
        });
      }
    }
  }
  return overlays;
}

/** Flat layout for all video clips (sorted by timeline position). */
export function buildTimelineVideoLayout(
  timeline: TimelineState
): TimelineClipLayout[] {
  const layouts: TimelineClipLayout[] = [];
  for (const track of timeline.videoTracks) {
    for (const clip of track.clips) {
      layouts.push({
        clip,
        trackId: track.id,
        startFrame: clip.startFrame,
        endFrame: clipEndFrame(clip),
      });
    }
  }
  return layouts.sort((a, b) => {
    if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
    return a.clip.id.localeCompare(b.clip.id);
  });
}

export function layoutAtTimelineFrame(
  timeline: TimelineState,
  frame: number
): TimelineClipLayout | null {
  const hit = videoClipAtTimelineFrame(timeline, frame);
  if (!hit) return null;
  return {
    clip: hit.clip,
    trackId: hit.trackId,
    startFrame: hit.clip.startFrame,
    endFrame: clipEndFrame(hit.clip),
  };
}

export function mediaTimeSecForTimelineFrame(
  clip: TimelineClip,
  timelineFrame: number,
  fps: number
): number {
  const offset = Math.max(0, timelineFrame - clip.startFrame);
  const trimOut =
    clip.trimOutFrames ?? clip.trimInFrames + clip.durationFrames;
  const frameInSource = Math.min(
    clip.trimInFrames + offset,
    Math.max(clip.trimInFrames, trimOut - 1)
  );
  return frameInSource / fps;
}

export function timelineFrameFromMediaTimeSec(
  clip: TimelineClip,
  mediaTimeSec: number,
  fps: number
): number {
  const frameInSource = Math.round(mediaTimeSec * fps);
  return clip.startFrame + Math.max(0, frameInSource - clip.trimInFrames);
}

export function nextLayoutAfter(
  layouts: TimelineClipLayout[],
  current: TimelineClipLayout
): TimelineClipLayout | null {
  const idx = layouts.findIndex((l) => l.clip.id === current.clip.id);
  if (idx === -1) return null;
  return layouts[idx + 1] ?? null;
}

export function isVideoClip(clip: TimelineClip): boolean {
  if (clip.sourceType === "image") return false;
  const path = clip.sourceUrl.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(path)) return false;
  return /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(path);
}

export function resolveMediaElementUrl(sourceUrl: string): string {
  if (sourceUrl.startsWith("http")) return sourceUrl;
  if (typeof window === "undefined") return sourceUrl;
  return new URL(sourceUrl, window.location.origin).href;
}
