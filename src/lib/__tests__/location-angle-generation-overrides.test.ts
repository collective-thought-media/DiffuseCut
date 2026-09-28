import { describe, expect, it } from "vitest";
import {
  mergeLocationAngleGenerationOverrides,
  parseLocationAngleGenerationOverrides,
} from "@/lib/location-angle-generation-overrides";

describe("location angle generation overrides", () => {
  it("round-trips stillNegativePrompt", () => {
    const json = mergeLocationAngleGenerationOverrides(null, {
      stillNegativePrompt: "wide establishing shot, reinvented wreckage",
    });
    expect(parseLocationAngleGenerationOverrides(json).stillNegativePrompt).toBe(
      "wide establishing shot, reinvented wreckage"
    );
  });

  it("clears empty stillNegativePrompt", () => {
    const json = mergeLocationAngleGenerationOverrides(
      JSON.stringify({ stillNegativePrompt: "old value" }),
      { stillNegativePrompt: "   " }
    );
    expect(json).toBeNull();
  });
});
