import { describe, expect, it } from "vitest";
import {
  detectDetailMacroShot,
  detectRearViewShot,
  detectWideShot,
  shouldSkipShotReferenceImage,
} from "@/lib/services/shot-composition";

const SENTINELS_PROMPT =
  "A cinematic wide shot from behind a tall, statuesque angel with pristine white wings standing on a reflective crystalline floor. In front of him, two towering, faceless Seraphim clad in seamless gold armor cross their flaming broadswords. The Seraphim have six wings made of solid white light. An endless, clear blue sky fills the background behind a massive architectural structure made of blinding white light. High-key lighting, perfectly serene, highly detailed.";

describe("shot composition detection", () => {
  it("detects rear macro shots", () => {
    expect(
      detectRearViewShot("cinematic tight close-up on the back of Azrael")
    ).toBe(true);
    expect(
      detectDetailMacroShot("cinematic tight close-up on the back of Azrael")
    ).toBe(true);
  });

  it("does not treat highly detailed wide shots as macro close-ups", () => {
    expect(detectWideShot(SENTINELS_PROMPT)).toBe(true);
    expect(detectDetailMacroShot(SENTINELS_PROMPT)).toBe(false);
  });

  it("does not skip reference images (IP-Adapter always used when available)", () => {
    expect(
      shouldSkipShotReferenceImage(
        "close-up on the back of Azrael, feathers emerging"
      )
    ).toBe(false);
    expect(
      shouldSkipShotReferenceImage("wide establishing shot of the stairway")
    ).toBe(false);
    expect(
      shouldSkipShotReferenceImage("rear view of Azrael on the stairway")
    ).toBe(false);
  });
});
