import { describe, expect, it } from "vitest";
import {
  clampTrim,
  effectiveTrimFrames,
  trimPreviewFrameInShot,
  validateTrim,
} from "@/lib/finishing/trim";

describe("clampTrim", () => {
  it("keeps in before out with at least one effective frame", () => {
    expect(clampTrim(72, 0, 72)).toEqual({ trimInFrames: 0, trimOutFrames: 72 });
    expect(clampTrim(72, 80, 10)).toEqual({ trimInFrames: 9, trimOutFrames: 10 });
  });
});

describe("validateTrim", () => {
  it("rejects out before in", () => {
    expect(validateTrim(48, 40, 20)).toBe("Out must be after in");
  });
});

describe("trimPreviewFrameInShot", () => {
  it("returns trim-relative edges on the trimmed timeline", () => {
    expect(trimPreviewFrameInShot(72, 6, 60, "in")).toBe(0);
    expect(trimPreviewFrameInShot(72, 6, 60, "out")).toBe(53);
  });
});

describe("effectiveTrimFrames", () => {
  it("subtracts in from out", () => {
    expect(effectiveTrimFrames(10, 58)).toBe(48);
  });
});
