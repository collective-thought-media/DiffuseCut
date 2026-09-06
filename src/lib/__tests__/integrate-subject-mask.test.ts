import { describe, expect, it } from "vitest";
import {
  computeIntegrateSubjectMaskBox,
  detectIntegrateFramingIntent,
} from "@/lib/integrate-subject-mask";

describe("integrate-subject-mask", () => {
  it("computes a medium centered subject box on an SDXL landscape plate", () => {
    const box = computeIntegrateSubjectMaskBox({
      frameWidth: 1216,
      frameHeight: 832,
      heightFraction: 0.55,
      anchorX: 0.5,
    });
    const subjectHeight = Math.round(832 * 0.55);
    // Box is taller than the subject: headroom keeps the head inside the
    // fully-denoised mask area instead of cropped by the hard edge.
    expect(box.boxHeight).toBe(Math.round(subjectHeight * 1.22));
    expect(box.boxWidth).toBe(Math.round(subjectHeight * 0.62));
    // Feet at 95% of frame height.
    expect(box.y + box.boxHeight).toBe(Math.round(832 * 0.95));
    // Horizontally centered.
    expect(box.x + Math.round(box.boxWidth / 2)).toBeGreaterThanOrEqual(605);
    expect(box.x + Math.round(box.boxWidth / 2)).toBeLessThanOrEqual(611);
  });

  it("keeps the box inside the frame for large scales at the edges", () => {
    const box = computeIntegrateSubjectMaskBox({
      frameWidth: 1024,
      frameHeight: 1024,
      heightFraction: 0.95,
      anchorX: 0.95,
    });
    expect(box.x + box.boxWidth).toBeLessThanOrEqual(1024);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.boxHeight).toBeLessThanOrEqual(1024);
  });

  it("clamps unreasonable inputs", () => {
    const box = computeIntegrateSubjectMaskBox({
      frameWidth: 1216,
      frameHeight: 832,
      heightFraction: 5,
      anchorX: -2,
    });
    expect(box.boxHeight).toBeLessThanOrEqual(832);
    expect(box.x).toBe(0);
  });

  it("uses defaults when fractions are omitted", () => {
    const box = computeIntegrateSubjectMaskBox({
      frameWidth: 1216,
      frameHeight: 832,
    });
    expect(box.boxHeight).toBe(Math.round(Math.round(832 * 0.55) * 1.22));
    expect(box.featherX).toBeGreaterThan(0);
    expect(box.featherBottom).toBeLessThan(box.featherTop);
  });

  it("runs the box to the frame edges for medium-shot framing with no edge feather", () => {
    const box = computeIntegrateSubjectMaskBox({
      frameWidth: 1216,
      frameHeight: 832,
      heightFraction: 1.15,
      anchorX: 0.5,
      groundY: 1.08,
    });
    // Subject taller than the frame: box spans the full height, so head and
    // leg crops land on the image border like real camera framing.
    expect(box.y).toBe(0);
    expect(box.y + box.boxHeight).toBe(832);
    // No feather at edges the box touches (feather there would ghost the subject).
    expect(box.featherTop).toBe(0);
    expect(box.featherBottom).toBe(0);
    expect(box.featherX).toBeGreaterThan(0);
  });

  describe("detectIntegrateFramingIntent", () => {
    it("detects medium-shot framing", () => {
      expect(
        detectIntegrateFramingIntent(
          "Medium shot on the sidewalk outside the deli, eye level, facing camera"
        )
      ).toEqual({ heightFraction: 1.15, groundY: 1.08 });
    });

    it("detects close-up framing", () => {
      const intent = detectIntegrateFramingIntent(
        "Close-up of her face lit by the window glow"
      );
      expect(intent?.heightFraction).toBeGreaterThan(1.5);
    });

    it("returns null for wide framing", () => {
      expect(
        detectIntegrateFramingIntent(
          "Theo stands alone on wet pavement outside the bakery doorway"
        )
      ).toBeNull();
    });
  });
});
