import { describe, expect, it } from "vitest";
import {
  assertAlternatingCameras,
  planInterviewMonologueSegments,
  segmentFramesFromDurationSec,
} from "@/lib/services/interview-monologue-planner";

const cameraA = {
  label: "Cam A medium",
  characterStateId: "state-a",
  prompt: "medium",
};
const cameraB = {
  label: "Cam B close",
  characterStateId: "state-b",
  prompt: "close",
};

describe("interview-monologue-planner", () => {
  it("builds fixed segments that sum to total frames", () => {
    const segments = planInterviewMonologueSegments({
      totalFrames: 8040,
      fps: 24,
      segmentDurationSec: 6,
      cameraA,
      cameraB,
    });
    const sum = segments.reduce((acc, s) => acc + s.durationFrames, 0);
    expect(sum).toBe(8040);
    expect(segments.length).toBe(Math.ceil(8040 / 144));
    assertAlternatingCameras(segments);
  });

  it("alternates starting with camera B when requested", () => {
    const segments = planInterviewMonologueSegments({
      totalFrames: 288,
      fps: 24,
      segmentDurationSec: 6,
      firstCameraIndex: 1,
      cameraA,
      cameraB,
    });
    expect(segments[0]!.cameraIndex).toBe(1);
    expect(segments[1]!.cameraIndex).toBe(0);
    assertAlternatingCameras(segments);
  });

  it("clamps segment length to safe bounds", () => {
    expect(segmentFramesFromDurationSec(2, 24)).toBe(48);
    expect(segmentFramesFromDurationSec(20, 24)).toBe(240);
  });
});
