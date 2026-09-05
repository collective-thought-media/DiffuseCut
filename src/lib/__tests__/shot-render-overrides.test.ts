import { describe, expect, it } from "vitest";
import {
  mergeShotRenderOverrides,
  parseShotRenderOverrides,
  resolveShotAudioPolicy,
  serializeShotRenderOverrides,
  type ShotAudioPolicy,
} from "@/lib/shot-render-overrides";

describe("shot-render-overrides", () => {
  it("round-trips stillNegativePrompt", () => {
    const json = serializeShotRenderOverrides(
      mergeShotRenderOverrides({}, {
        stillNegativePrompt: "beige wall, wrong backdrop",
      })
    );
    expect(parseShotRenderOverrides(json).stillNegativePrompt).toBe(
      "beige wall, wrong backdrop"
    );
  });

  it("clears empty stillNegativePrompt", () => {
    const json = serializeShotRenderOverrides(
      mergeShotRenderOverrides(
        { stillNegativePrompt: "old value" },
        { stillNegativePrompt: "   " }
      )
    );
    expect(json).toBeNull();
  });

  it("round-trips faceDetail", () => {
    const json = serializeShotRenderOverrides(
      mergeShotRenderOverrides({}, { faceDetail: "refine" })
    );
    expect(parseShotRenderOverrides(json).faceDetail).toBe("refine");
  });

  it("keeps faceDetail alongside other overrides", () => {
    const json = serializeShotRenderOverrides(
      mergeShotRenderOverrides(
        { stillReferenceMode: "scene_edit" },
        { faceDetail: "refine" }
      )
    );
    const parsed = parseShotRenderOverrides(json);
    expect(parsed.stillReferenceMode).toBe("scene_edit");
    expect(parsed.faceDetail).toBe("refine");
  });

  describe("resolveShotAudioPolicy", () => {
    it("auto keeps shot audio when no finishing tracks exist", () => {
      expect(resolveShotAudioPolicy(undefined, false)).toBe("keep");
    });

    it("auto mutes shot audio once finishing tracks exist", () => {
      expect(resolveShotAudioPolicy(undefined, true)).toBe("mute");
    });

    it("explicit keep wins over finishing tracks", () => {
      expect(resolveShotAudioPolicy("keep", true)).toBe("keep");
    });

    it("explicit mute wins without finishing tracks", () => {
      expect(resolveShotAudioPolicy("mute", false)).toBe("mute");
    });

    it("clearing the override returns to auto", () => {
      const json = serializeShotRenderOverrides(
        mergeShotRenderOverrides(
          { audioPolicy: "mute" },
          { audioPolicy: "" as ShotAudioPolicy }
        )
      );
      expect(parseShotRenderOverrides(json).audioPolicy).toBeUndefined();
    });
  });
});
