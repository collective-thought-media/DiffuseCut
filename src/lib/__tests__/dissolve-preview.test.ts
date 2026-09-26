import { describe, expect, it } from "vitest";
import { computeDissolvePreview } from "@/lib/timeline/dissolve-preview";
import type { TimelineClip, TimelineState } from "@/lib/timeline/types";
import { buildPrimaryVideoLayout } from "@/lib/timeline/video-layout";

function clip(
  id: string,
  start: number,
  dur: number,
  extra: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    name: id,
    sourceType: "file",
    sourceRef: id,
    sourceUrl: `/media/${id}.mp4`,
    startFrame: start,
    durationFrames: dur,
    trimInFrames: 0,
    trimOutFrames: dur,
    ...extra,
  };
}

describe("computeDissolvePreview", () => {
  const fps = 24;
  const a = clip("a", 0, 48, {
    transitionOut: { type: "dissolve", durationSeconds: 0.5 },
  });
  const b = clip("b", 48, 48, {
    transitionIn: { type: "dissolve", durationSeconds: 0.5 },
  });
  const timeline: TimelineState = {
    fps,
    format: { aspectRatio: "16:9", width: 1920, height: 1080 },
    videoTracks: [{ id: "v1", name: "V1", type: "video", clips: [a, b] }],
    audioTracks: [],
  };
  const v1Layout = buildPrimaryVideoLayout(timeline);

  it("returns null outside dissolve window", () => {
    expect(
      computeDissolvePreview({
        fps,
        playheadFrame: 12,
        v1Layout,
        audioTracks: [],
      })
    ).toBeNull();
  });

  it("mixes at the cut", () => {
    const atCut = computeDissolvePreview({
      fps,
      playheadFrame: 48,
      v1Layout,
      audioTracks: [],
    });
    expect(atCut?.active).toBe(true);
    expect(atCut!.prev.opacity).toBeGreaterThan(0);
    expect(atCut!.next.opacity).toBeGreaterThan(0);
  });
});
