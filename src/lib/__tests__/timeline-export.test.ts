import { describe, expect, it } from "vitest";
import type { TimelineClip } from "@/lib/timeline/types";
import { clipDurationFrames } from "@/lib/services/timeline-export";

function clip(partial: Partial<TimelineClip> & Pick<TimelineClip, "durationFrames">): TimelineClip {
  return {
    id: "c1",
    name: "Test",
    sourceType: "shot",
    sourceRef: "shot-1",
    sourceUrl: "/media/x",
    startFrame: 0,
    trimInFrames: 0,
    trimOutFrames: null,
    ...partial,
  };
}

describe("clipDurationFrames", () => {
  it("uses trim in/out when set", () => {
    const duration = clipDurationFrames(
      clip({ durationFrames: 100, trimInFrames: 10, trimOutFrames: 40 }),
      24
    );
    expect(duration).toBe(30);
  });

  it("falls back to durationFrames when trim out is unset", () => {
    const duration = clipDurationFrames(clip({ durationFrames: 48 }), 24);
    expect(duration).toBe(48);
  });
});

describe("timeline clip ordering (export prep)", () => {
  it("sorts clips by startFrame so gaps are preserved", () => {
    const clips = [
      clip({ id: "b", startFrame: 96, durationFrames: 24 }),
      clip({ id: "a", startFrame: 0, durationFrames: 48 }),
    ].sort((a, b) => a.startFrame - b.startFrame);

    expect(clips[0]?.startFrame).toBe(0);
    expect(clips[1]?.startFrame).toBe(96);
    const spanEnd =
      clips[1]!.startFrame + clipDurationFrames(clips[1]!, 24);
    expect(spanEnd).toBe(120);
  });
});
