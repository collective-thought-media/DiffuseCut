import { describe, expect, it } from "vitest";
import {
  applyFrameCountTransform,
  ltxLengthFromDurationFrames,
  minimaxH3LengthFromDurationFrames,
} from "@/lib/services/frame-count-transform";

describe("frame count transform", () => {
  it("matches LTX 8n+1 rule for 3s @ 24fps", () => {
    expect(ltxLengthFromDurationFrames(72)).toBe(73);
  });

  it("matches 2s @ 24fps", () => {
    expect(ltxLengthFromDurationFrames(48)).toBe(49);
  });

  it("snaps MiniMax H3 to 17k+5 grid", () => {
    expect(minimaxH3LengthFromDurationFrames(72)).toBe(73);
    expect(minimaxH3LengthFromDurationFrames(124)).toBe(124);
    expect(minimaxH3LengthFromDurationFrames(125)).toBe(141);
  });

  it("passes through when transform is none", () => {
    expect(applyFrameCountTransform(72, "none")).toBe(72);
  });

  it("applies ltx_8n1 transform from bindings", () => {
    expect(applyFrameCountTransform(72, "ltx_8n1")).toBe(73);
  });

  it("applies minimax_17k5 transform from bindings", () => {
    expect(applyFrameCountTransform(72, "minimax_17k5")).toBe(73);
  });
});
