import type { TimelineClip, TimelineState, TimelineTrack } from "@/lib/timeline/types";
import { clipEndFrame } from "@/lib/timeline/playhead";

export type AudioClipLayout = {
  clipId: string;
  startFrame: number;
  endFrame: number;
};

export type AudioTrackLayout = {
  trackId: string;
  layout: AudioClipLayout[];
  clipById: Map<string, TimelineClip>;
};

export function buildAudioTrackLayouts(timeline: TimelineState): AudioTrackLayout[] {
  return timeline.audioTracks.map((track) => {
    const clipById = new Map<string, TimelineClip>();
    const layout: AudioClipLayout[] = [];
    for (const clip of track.clips) {
      clipById.set(clip.id, clip);
      layout.push({
        clipId: clip.id,
        startFrame: clip.startFrame,
        endFrame: clipEndFrame(clip),
      });
    }
    layout.sort((a, b) => a.startFrame - b.startFrame);
    return { trackId: track.id, layout, clipById };
  });
}

export function findAudioClipAtFrame(
  trackLayout: AudioTrackLayout,
  frame: number
): { clip: TimelineClip; layout: AudioClipLayout } | null {
  const { layout, clipById } = trackLayout;
  let lo = 0;
  let hi = layout.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const l = layout[mid]!;
    if (frame < l.startFrame) {
      hi = mid - 1;
    } else if (frame >= l.endFrame) {
      lo = mid + 1;
    } else {
      const clip = clipById.get(l.clipId);
      if (clip) return { clip, layout: l };
      return null;
    }
  }
  return null;
}

export function audioMediaTimeSecAtFrame(
  clip: TimelineClip,
  layout: AudioClipLayout,
  frame: number,
  fps: number
): number {
  const offsetFrames = Math.max(0, frame - layout.startFrame);
  return (clip.trimInFrames + offsetFrames) / fps;
}

export function trackVolume(track: TimelineTrack): number {
  if (track.muted) return 0;
  return typeof track.volume === "number"
    ? Math.max(0, Math.min(1, track.volume))
    : 1;
}
