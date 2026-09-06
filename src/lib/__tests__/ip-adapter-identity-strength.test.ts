import { describe, expect, it } from "vitest";
import {
  CHARACTER_ONLY_IDENTITY_STRENGTH_PRESETS,
  INTEGRATE_IDENTITY_STRENGTH_PRESETS,
  resolveShotIdentityStrengthPreset,
} from "@/lib/ip-adapter-profiles";

describe("resolveShotIdentityStrengthPreset", () => {
  it("uses a harder High lock for character-only mode", () => {
    expect(resolveShotIdentityStrengthPreset("high", "character")).toEqual(
      CHARACTER_ONLY_IDENTITY_STRENGTH_PRESETS.high
    );
    expect(CHARACTER_ONLY_IDENTITY_STRENGTH_PRESETS.high.weight).toBeGreaterThan(
      CHARACTER_ONLY_IDENTITY_STRENGTH_PRESETS.balanced.weight
    );
  });

  it("uses a moderated High bump for integrate that stays above Balanced", () => {
    const high = resolveShotIdentityStrengthPreset("high", "integrate_in_scene");
    const balanced = resolveShotIdentityStrengthPreset(
      "balanced",
      "integrate_in_scene"
    );
    expect(high).toEqual(INTEGRATE_IDENTITY_STRENGTH_PRESETS.high);
    expect(high.weight).toBeGreaterThan(balanced.weight);
    expect(high.weight).toBeLessThan(
      CHARACTER_ONLY_IDENTITY_STRENGTH_PRESETS.high.weight
    );
  });
});
