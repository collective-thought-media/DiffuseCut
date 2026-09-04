import { describe, expect, it } from "vitest";
import {
  mergeShotRenderOverrides,
  parseShotRenderOverrides,
  serializeShotRenderOverrides,
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
});
