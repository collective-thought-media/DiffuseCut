import { describe, expect, it } from "vitest";
import {
  buildPunchInFilter,
  computePunchInCropBox,
  normalizePunchInZoom,
} from "@/lib/services/image-punch-in";

describe("image punch-in", () => {
  it("crops a centered 2x punch-in window and scales back to source size", () => {
    const box = computePunchInCropBox(1344, 768, { zoom: 2, focus: "center" });
    expect(box).toEqual({
      width: 672,
      height: 384,
      x: 336,
      y: 192,
      outWidth: 1344,
      outHeight: 768,
    });
    expect(buildPunchInFilter(box)).toBe(
      "crop=672:384:336:192,scale=1344:768:flags=lanczos"
    );
  });

  it("shifts the crop window for left and upper focus", () => {
    const left = computePunchInCropBox(1000, 1000, {
      zoom: 2,
      focus: "left",
    });
    expect(left.x).toBe(0);
    expect(left.y).toBe(250);

    const upper = computePunchInCropBox(1000, 1000, {
      zoom: 2,
      focus: "upper_center",
    });
    expect(upper.x).toBe(250);
    expect(upper.y).toBe(100);
  });

  it("clamps absurd zoom values", () => {
    expect(normalizePunchInZoom(0.5)).toBe(1.15);
    expect(normalizePunchInZoom(99)).toBe(4);
  });
});
