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

  it("does not treat storyboard medium close-ups as macro detail plates", () => {
    expect(
      detectDetailMacroShot(
        "medium close-up from the waist up, looking straight to camera"
      )
    ).toBe(false);
    expect(
      detectDetailMacroShot("Close-up of Jasmine holding a sword in the lair")
    ).toBe(false);
    expect(
      detectDetailMacroShot("extreme macro close-up on scale texture")
    ).toBe(true);
  });
});
