import { describe, expect, it } from "vitest";
import {
  aceStepPromptForKind,
  buildAceStepSfxPrompt,
  extractSfxCueFromBrief,
  resolveAceStepSourceDuration,
} from "@/lib/services/ace-step-prompt";

describe("ace-step-prompt sfx", () => {
  it("extracts a single concrete cue from suggest-template wording", () => {
    const brief =
      "Realistic cinematic sound design for Hell Gate. rain ambience, water droplets, low fire crackle. Scene context: demon descends. Foley and ambience only, no music, no melody, no vocals.";

    expect(extractSfxCueFromBrief(brief)).toMatch(
      /rain ambience, water droplets, low fire crackle/i
    );
  });

  it("builds ACE-Step tags that discourage musical output", () => {
    const result = buildAceStepSfxPrompt("wind through open space");

    expect(result.tags).toContain("ambient foley texture");
    expect(result.tags).toContain("wind through open space");
    expect(result.tags).toContain("no static noise");
    expect(result.lyrics).toBe("");
  });

  it("uses a longer minimum duration for short SFX clips", () => {
    expect(resolveAceStepSourceDuration("sfx", 2.5)).toBe(8);
    expect(resolveAceStepSourceDuration("sfx", 12)).toBe(12);
    expect(resolveAceStepSourceDuration("music", 2.5)).toBe(2.5);
  });

  it("does not attach bpm or key metadata to SFX prompts", () => {
    const result = aceStepPromptForKind("sfx", "distant thunder rumble", 3);

    expect(result.bpm).toBeUndefined();
    expect(result.keyscale).toBeUndefined();
    expect(result.tags).toContain("distant thunder rumble");
  });
});
