import { describe, expect, it } from "vitest";
import type { Shot } from "@/lib/db/schema";
import { buildRuleBasedSfxPrompt, buildWooshPromptFromShot } from "@/lib/services/shot-sfx-suggest";
import { buildWooshSfxPrompt, extractSfxCueFromBrief } from "@/lib/services/sfx-prompt";

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: "shot-1",
    projectId: "proj-1",
    sortOrder: 0,
    title: "Opening",
    prompt: "A demon descends through storm clouds over a burning city.",
    renderOverridesJson: null,
    durationFrames: 72,
    fps: null,
    locationId: null,
    locationStateId: null,
    locationAngleId: null,
    visualReferenceFocus: "location",
    placeholderKind: null,
    placeholderPath: null,
    videoPath: null,
    trimInFrames: 0,
    trimOutFrames: null,
    renderStatus: "pending",
    renderJobId: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("shot-sfx-suggest", () => {
  it("matches storm cues from shot text", () => {
    const prompt = buildRuleBasedSfxPrompt(makeShot(), 0);

    expect(prompt).toContain("Cues:");
    expect(prompt).toMatch(/wind|rain|storm/i);
    expect(prompt).not.toContain("fire crackle");
    expect(prompt.toLowerCase()).toContain("no music");
  });

  it("prioritizes lightning over rain and drops demon-only fire crackle", () => {
    const prompt = buildRuleBasedSfxPrompt(
      makeShot({
        title: "Shot 4: The Ascent Begins",
        prompt:
          "Heavy rain pours down. A sudden sharp flash of bright lightning illuminates the pitch-black background. Azrael, a gaunt demon, climbs crumbling stone stairs.",
      }),
      3
    );

    expect(prompt).toMatch(/lightning bolt strike/i);
    expect(prompt).toContain("heavy rain");
    expect(prompt).not.toContain("footsteps");
    expect(prompt).not.toContain("fire crackle");
  });

  it("builds a lightning-first Woosh prompt without incidental foley", () => {
    const model = buildWooshPromptFromShot(
      makeShot({
        title: "Shot 4: The Ascent Begins",
        prompt:
          "Heavy rain pours down. A sudden sharp flash of bright lightning illuminates the pitch-black background. Azrael climbs crumbling stone stairs.",
      }),
      3
    );

    expect(model).toMatch(/lightning bolt strike/i);
    expect(model).toContain("heavy rain");
    expect(model).not.toContain("footsteps");
    expect(model).not.toContain("crumble");
  });

  it("includes lightning for dramatic illumination shots", () => {
    const prompt = buildRuleBasedSfxPrompt(
      makeShot({
        title: "Shot 5: Fractured Wings",
        prompt:
          "A demon's back in a heavy rainstorm. Dramatic lightning illumination, pitch-black void background.",
      }),
      4
    );

    expect(prompt).toMatch(/lightning bolt strike/i);
    expect(prompt).toContain("heavy rain");
  });

  it("falls back to room tone when no rules match", () => {
    const prompt = buildRuleBasedSfxPrompt(
      makeShot({
        title: "Close-up",
        prompt: "Character looks at the camera in silence.",
      }),
      1
    );

    expect(prompt).toContain("subtle environmental room tone");
  });
});

describe("sfx-prompt extraction", () => {
  it("keeps lightning and thunder when trimming long legacy briefs", () => {
    const brief =
      "Realistic cinematic sound design for Shot 4. rain ambience, water droplets, distant thunder rumble, low fire crackle, ember pops. Scene context: lightning flash. Foley and ambience only, no music.";

    expect(extractSfxCueFromBrief(brief)).toMatch(/distant thunder rumble/i);
    expect(buildWooshSfxPrompt(brief)).toMatch(/distant thunder rumble/i);
  });

  it("parses shot-context brief format into model cues", () => {
    const brief =
      "Sound for: Shot 4: The Ascent Begins. Cues: sharp lightning crack, electric discharge, heavy rain, water hitting surfaces. On screen: Heavy rain pours down, lightning illuminates crumbling stone stairs. Foley only, no music, no vocals.";

    expect(buildWooshSfxPrompt(brief)).toMatch(/lightning crack/i);
    expect(buildWooshSfxPrompt(brief)).toContain("Heavy rain pours down");
  });

  it("preserves explicit lightning cues ahead of generic rain", () => {
    const brief =
      "sharp lightning crack, electric discharge, heavy rain, water hitting surfaces";

    expect(buildWooshSfxPrompt(brief)).toMatch(
      /sharp lightning crack, electric discharge, heavy rain/i
    );
  });
});
