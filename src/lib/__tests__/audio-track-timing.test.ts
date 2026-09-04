import { describe, expect, it } from "vitest";
import type { Shot } from "@/lib/db/schema";
import {
  applySpanModeToTrack,
  resolveTrackTiming,
  secondsToFrames,
} from "@/lib/finishing/audio-track-timing";

function shot(id: string, durationFrames: number, sortOrder: number): Shot {
  return {
    id,
    projectId: "p1",
    title: id,
    prompt: "",
    sortOrder,
    durationFrames,
    trimInFrames: 0,
    trimOutFrames: durationFrames,
    videoPath: null,
    placeholderPath: null,
    placeholderKind: null,
    renderStatus: "pending",
    renderJobId: null,
    updatedAt: 1,
    createdAt: 1,
  } as Shot;
}

describe("resolveTrackTiming", () => {
  const shots = [shot("a", 48, 0), shot("b", 72, 1)];
  const totalFrames = 120;

  it("spans full timeline from zero", () => {
    const timing = resolveTrackTiming(
      {
        startFrame: 5,
        durationFrames: null,
        spanMode: "full_timeline",
        targetShotId: null,
      },
      shots,
      totalFrames
    );
    expect(timing).toEqual({
      startFrame: 0,
      durationFrames: 120,
      endFrame: 120,
    });
  });

  it("spans from start frame through edit end", () => {
    const timing = resolveTrackTiming(
      {
        startFrame: 48,
        durationFrames: null,
        spanMode: "rest_of_timeline",
        targetShotId: null,
      },
      shots,
      totalFrames
    );
    expect(timing).toEqual({
      startFrame: 48,
      durationFrames: 72,
      endFrame: 120,
    });
  });

  it("locks to a single shot", () => {
    const timing = resolveTrackTiming(
      {
        startFrame: 0,
        durationFrames: null,
        spanMode: "single_shot",
        targetShotId: "b",
      },
      shots,
      totalFrames
    );
    expect(timing).toEqual({
      startFrame: 48,
      durationFrames: 72,
      endFrame: 120,
    });
  });
});

describe("applySpanModeToTrack", () => {
  it("converts custom seconds to frames", () => {
    const result = applySpanModeToTrack(
      {
        startFrame: 0,
        durationFrames: null,
        spanMode: "custom",
        targetShotId: null,
      },
      [shot("a", 48, 0)],
      48,
      { durationFrames: secondsToFrames(10, 24) }
    );
    expect(result.durationFrames).toBe(240);
  });
});
