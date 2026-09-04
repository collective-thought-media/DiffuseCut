import { describe, expect, it } from "vitest";
import {
  buildCharacterSheetPromptTemplate,
  buildCharacterSheetNegativePrompt,
} from "@/lib/services/prompt-preprocess";
import {
  applyVisualStyleToShotPrompt,
  parseVisualStyle,
  DEFAULT_VISUAL_STYLE,
} from "@/lib/services/visual-style";

describe("parseVisualStyle", () => {
  it("defaults to photoreal when empty", () => {
    expect(parseVisualStyle(null).preset).toBe("photoreal_cinematic");
    expect(parseVisualStyle("{}").preset).toBe("photoreal_cinematic");
  });

  it("reads saved preset", () => {
    expect(
      parseVisualStyle('{"preset":"animation_cartoon"}').preset
    ).toBe("animation_cartoon");
  });
});

describe("buildCharacterSheetPromptTemplate with visual style", () => {
  it("uses photoreal theme by default", () => {
    const prompt = buildCharacterSheetPromptTemplate("Aria", "Pilot", DEFAULT_VISUAL_STYLE);
    expect(prompt.toLowerCase()).toContain("canon eos 5d mark iii");
    expect(prompt.toLowerCase()).not.toContain("animation character");
  });

  it("uses animation theme when selected", () => {
    const prompt = buildCharacterSheetPromptTemplate("Aria", "Pilot", {
      preset: "animation_cartoon",
    });
    expect(prompt.toLowerCase()).toContain("animation character");
    expect(prompt.toLowerCase()).toContain("turnaround");
  });
});

describe("buildCharacterSheetNegativePrompt", () => {
  it("adds cartoon negatives for photoreal preset", () => {
    const negative = buildCharacterSheetNegativePrompt(DEFAULT_VISUAL_STYLE);
    expect(negative.toLowerCase()).toContain("cartoon");
    expect(negative.toLowerCase()).toContain("turnaround sheet");
    expect(negative.toLowerCase()).toContain("two heads");
  });
});

describe("applyVisualStyleToShotPrompt", () => {
  it("appends cinematic suffix for photoreal shots", () => {
    const prompt = applyVisualStyleToShotPrompt(
      "Wide shot of a woman entering a diner",
      DEFAULT_VISUAL_STYLE
    );
    expect(prompt).toContain("Wide shot of a woman entering a diner");
    expect(prompt.toLowerCase()).toContain("photorealistic");
  });

  it("uses custom suffix when preset is custom", () => {
    const prompt = applyVisualStyleToShotPrompt("Close-up", {
      preset: "custom",
      customSuffix: "gritty documentary, handheld",
    });
    expect(prompt).toContain("gritty documentary");
  });
});
