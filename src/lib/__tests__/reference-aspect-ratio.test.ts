import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFERENCE_ASPECT_RATIO,
  parseReferenceAspectRatio,
  resolveCharacterSheetReferenceDimensions,
  resolveReferenceAspectRatio,
} from "@/lib/services/reference-aspect-ratio";
import { DEFAULT_VISUAL_STYLE } from "@/lib/services/visual-style";

describe("reference aspect ratio", () => {
  it("defaults to 16:9", () => {
    expect(parseReferenceAspectRatio(undefined)).toBe("16_9");
    expect(DEFAULT_REFERENCE_ASPECT_RATIO).toBe("16_9");
  });

  it("resolves preset dimensions", () => {
    const ratio = resolveReferenceAspectRatio("16_9");
    expect(ratio.width).toBe(1344);
    expect(ratio.height).toBe(768);
  });

  it("falls back for invalid preset", () => {
    expect(parseReferenceAspectRatio("invalid")).toBe("16_9");
  });

  it("uses project preset for photo-real casting portraits", () => {
    const dims = resolveCharacterSheetReferenceDimensions(
      DEFAULT_VISUAL_STYLE,
      "16_9"
    );
    expect(dims).toEqual({ width: 1344, height: 768 });
  });
});
