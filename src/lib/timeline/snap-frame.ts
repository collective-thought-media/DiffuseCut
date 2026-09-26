import type { TimelineState } from "@/lib/timeline/types";
import { clipEndFrame } from "@/lib/timeline/playhead";

/** Snap a frame index to clip edges and whole-frame grid when snap is enabled. */
export function snapTimelineFrame(
  frame: number,
  timeline: TimelineState,
  options: { enabled: boolean; thresholdFrames?: number }
): number {
  const rounded = Math.max(0, Math.round(frame));
  if (!options.enabled) return rounded;

  const threshold = options.thresholdFrames ?? Math.max(1, Math.round(timeline.fps / 4));
  const candidates = new Set<number>([0, rounded]);

  for (const track of [...timeline.videoTracks, ...timeline.audioTracks]) {
    for (const clip of track.clips) {
      candidates.add(clip.startFrame);
      candidates.add(clipEndFrame(clip));
    }
  }

  let best = rounded;
  let bestDist = threshold + 1;
  for (const c of candidates) {
    const dist = Math.abs(c - rounded);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}
