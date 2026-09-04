import { describe, expect, it } from "vitest";
import {
  durationMs,
  framesFromMs,
  formatFrameLabel,
  snapFrames,
  totalProjectFrames,
} from "@/lib/timing/frames";
import { validateBindings } from "@/lib/services/workflow-builder";
import { BindingNodeMismatchError } from "@/types";

describe("frames", () => {
  it("converts frames to ms at 24fps", () => {
    expect(durationMs(24, 24)).toBe(1000);
    expect(durationMs(48, 24)).toBe(2000);
  });

  it("snaps ms to frames", () => {
    expect(framesFromMs(1000, 24)).toBe(24);
  });

  it("sums project frames", () => {
    expect(totalProjectFrames([{ durationFrames: 24 }, { durationFrames: 48 }])).toBe(72);
  });

  it("formats frame label", () => {
    expect(formatFrameLabel(48, 24)).toContain("48 frames");
  });

  it("snapFrames enforces minimum", () => {
    expect(snapFrames(0)).toBe(1);
  });
});

describe("validateBindings", () => {
  const workflow = JSON.stringify({
    "3": { class_type: "KSampler", inputs: {} },
    "6": { class_type: "CLIPTextEncode", inputs: {} },
  });

  it("passes when nodes exist", () => {
    expect(() =>
      validateBindings(workflow, {
        promptNodeId: "6",
        seedNodeId: "3",
      })
    ).not.toThrow();
  });

  it("throws BINDING_NODE_MISMATCH for missing nodes", () => {
    expect(() =>
      validateBindings(workflow, { promptNodeId: "99" })
    ).toThrow(BindingNodeMismatchError);
  });
});
