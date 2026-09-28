import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFERENCE_ASPECT_RATIO,
  REFERENCE_ASPECT_RATIO_PRESETS,
  alignVideoSizeToReferenceAspect,
  applyProjectAspectRatioToRenderSettings,
  parseReferenceAspectRatio,
  resolveCharacterSheetReferenceDimensions,
  resolveFrontBackDiptychDimensions,
  resolveReferenceAspectRatio,
  resolveVideoDimensionsForAspectRatio,
  type ReferenceAspectRatioPreset,
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

  it("delivers video at 1080-line sizes that match each preset shape", () => {
    expect(resolveVideoDimensionsForAspectRatio("16_9")).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(resolveVideoDimensionsForAspectRatio("9_16")).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(resolveVideoDimensionsForAspectRatio("1_1")).toEqual({
      width: 1080,
      height: 1080,
    });
    for (const id of Object.keys(
      REFERENCE_ASPECT_RATIO_PRESETS
    ) as ReferenceAspectRatioPreset[]) {
      const stills = resolveCharacterSheetReferenceDimensions(
        DEFAULT_VISUAL_STYLE,
        id
      );
      const video = resolveVideoDimensionsForAspectRatio(id);
      expect(Math.min(video.width, video.height)).toBe(1080);
      expect(
        Math.abs(video.width / video.height - stills.width / stills.height)
      ).toBeLessThan(0.05);
    }
  });

  it("upgrades a saved still-canvas video size to the delivery size", () => {
    expect(
      alignVideoSizeToReferenceAspect({
        referenceAspectRatio: "16_9",
        videoWidth: 1344,
        videoHeight: 768,
      })
    ).toEqual({ videoWidth: 1920, videoHeight: 1080 });
    expect(
      alignVideoSizeToReferenceAspect({
        referenceAspectRatio: "9_16",
        videoWidth: 768,
        videoHeight: 1344,
      })
    ).toEqual({ videoWidth: 1080, videoHeight: 1920 });
  });

  it("replaces leftover landscape video size on a 9:16 project", () => {
    expect(
      alignVideoSizeToReferenceAspect({
        referenceAspectRatio: "9_16",
        videoWidth: 1920,
        videoHeight: 1080,
      })
    ).toEqual({ videoWidth: 1080, videoHeight: 1920 });
  });

  it("keeps 1920x1080 on a 16:9 project", () => {
    expect(
      alignVideoSizeToReferenceAspect({
        referenceAspectRatio: "16_9",
        videoWidth: 1920,
        videoHeight: 1080,
      })
    ).toEqual({ videoWidth: 1920, videoHeight: 1080 });
  });

  it("fills render settings from the project ratio so the Render tab can leave width and height alone", () => {
    const next = applyProjectAspectRatioToRenderSettings({
      referenceAspectRatio: "1_1",
      videoWidth: 1920,
      videoHeight: 1080,
      checkpoint: "kept.safetensors",
    });
    expect(next.videoWidth).toBe(1080);
    expect(next.videoHeight).toBe(1080);
    expect(next.checkpoint).toBe("kept.safetensors");
  });

  it("keeps a custom portrait size the user typed", () => {
    expect(
      alignVideoSizeToReferenceAspect({
        referenceAspectRatio: "9_16",
        videoWidth: 1080,
        videoHeight: 1920,
      })
    ).toEqual({ videoWidth: 1080, videoHeight: 1920 });
  });

  it("doubles width for front+back diptych canvas", () => {
    const dims = resolveFrontBackDiptychDimensions(
      DEFAULT_VISUAL_STYLE,
      "16_9"
    );
    expect(dims).toEqual({ width: 2688, height: 768 });
  });
});
