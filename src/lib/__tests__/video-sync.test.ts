import { describe, expect, it } from "vitest";
import type { Shot } from "@/lib/db/schema";
import {
  globalFrameFromVideoTime,
  isVideoAtShotEnd,
  shotVideoTimeSec,
} from "@/lib/finishing/video-sync";

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
