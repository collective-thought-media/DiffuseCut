import { describe, expect, it } from "vitest";
import type { Shot } from "@/lib/db/schema";
import {
  globalFrameFromVideoTime,
  isVideoAtShotEnd,
  shotVideoTimeSec,
} from "@/lib/finishing/video-sync";
import {
  frameAtTrimmedTimelinePosition,
  totalTimelineFrames,
  trimmedShotStartFrame,
} from "@/lib/timing/frames";

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: "shot-1",
    projectId: "proj",
    title: "Shot",
    prompt: "",
    sortOrder: 0,
    durationFrames: 48,
    trimInFrames: 0,
    trimOutFrames: 48,
    videoPath: "/renders/shot.mp4",
    placeholderPath: null,
    placeholderKind: null,
    renderStatus: "done",
    renderJobId: null,
    updatedAt: 1,
    createdAt: 1,
    ...overrides,
  } as Shot;
}

describe("isVideoAtShotEnd", () => {
  it("returns true when playback reaches trim out", () => {
    const shot = makeShot({ durationFrames: 48, trimOutFrames: 48 });
    expect(isVideoAtShotEnd(shot, 2, 24)).toBe(true);
  });

  it("returns false before trim out", () => {
    const shot = makeShot({ durationFrames: 48, trimOutFrames: 48 });
    expect(isVideoAtShotEnd(shot, 1, 24)).toBe(false);
  });

  it("ends at trim out even when file is longer", () => {
    const shot = makeShot({ durationFrames: 72, trimOutFrames: 72 });
    expect(isVideoAtShotEnd(shot, 3, 24, 3.04)).toBe(true);
    expect(isVideoAtShotEnd(shot, 2.9, 24, 3.04)).toBe(false);
  });
});

describe("shot timeline mapping", () => {
  it("maps last timeline frame near trim out time", () => {
    const shot = makeShot({ durationFrames: 48, trimOutFrames: 48 });
    const time = shotVideoTimeSec(shot, 47, 24);
    expect(time).toBeCloseTo(47 / 24, 3);
  });

  it("maps trim out time back to last timeline frame", () => {
    const shots = [makeShot({ durationFrames: 48, trimOutFrames: 48 })];
    expect(globalFrameFromVideoTime(shots, 0, 2, 24)).toBe(47);
  });
});

describe("trimmed timeline", () => {
  const shots = [
    makeShot({ id: "a", durationFrames: 72, trimInFrames: 0, trimOutFrames: 72 }),
    makeShot({ id: "b", durationFrames: 72, trimInFrames: 0, trimOutFrames: 62 }),
    makeShot({ id: "c", durationFrames: 72, trimInFrames: 6, trimOutFrames: 72 }),
  ];

  it("shortens the timeline by the trimmed frames", () => {
    expect(totalTimelineFrames(shots)).toBe(72 + 62 + 66);
  });

  it("starts the next shot right after the trimmed span", () => {
    expect(trimmedShotStartFrame(shots, 1)).toBe(72);
    expect(trimmedShotStartFrame(shots, 2)).toBe(72 + 62);
  });

  it("positions frames inside the trim window without stretching", () => {
    // Frame 133 = 61 frames into the second shot (its last trimmed frame).
    expect(frameAtTrimmedTimelinePosition(shots, 133)).toEqual({
      shotIndex: 1,
      frameInShot: 61,
    });
    // Frame 134 rolls into the third shot.
    expect(frameAtTrimmedTimelinePosition(shots, 134)).toEqual({
      shotIndex: 2,
      frameInShot: 0,
    });
  });

  it("plays trimmed frames at natural video speed", () => {
    // Third shot trimmed 6-72: timeline frame 0 of the shot is source frame 6.
    expect(shotVideoTimeSec(shots[2], 0, 24)).toBeCloseTo(6 / 24, 5);
    expect(shotVideoTimeSec(shots[2], 30, 24)).toBeCloseTo(36 / 24, 5);
  });

  it("maps video time back onto the trimmed timeline", () => {
    // 1s into the third shot's source = source frame 24 = trimmed frame 18.
    expect(globalFrameFromVideoTime(shots, 2, 1, 24)).toBe(72 + 62 + 18);
  });
});
