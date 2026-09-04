import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildCharacterSheetPromptTemplate,
  buildCharacterSheetPrompts,
  buildCharacterSheetNegativePrompt,
  buildLocationReferencePromptTemplate,
  buildLocationReferenceNegativePrompt,
  detectVirtualBackdropLocation,
  DEFAULT_CHARACTER_SHEET_NEGATIVE,
  finalizeCharacterSheetPrompt,
  LOCATION_REFERENCE_ANCHOR_PREFIX,
  LOCATION_REFERENCE_BACKDROP_LAYOUT_PREFIX,
} from "@/lib/services/prompt-preprocess";

vi.mock("@/lib/services/llm-prompt-expand", () => ({
  expandPromptWithLlm: vi.fn(async ({ templatePrompt }: { templatePrompt: string }) => ({
    prompt: templatePrompt,
    usedLlm: false,
  })),
}));

describe("buildCharacterSheetPromptTemplate", () => {
  it("includes turnaround keywords for animation preset", () => {
    const prompt = buildCharacterSheetPromptTemplate(
      "Aria",
      "Young pilot with red jacket",
      { preset: "animation_cartoon" }
    );
    expect(prompt).toContain("Aria");
    expect(prompt).toContain("Young pilot with red jacket");
    expect(prompt.toLowerCase()).toContain("turnaround");
    expect(prompt.toLowerCase()).toContain("front view");
    expect(prompt.toLowerCase()).toContain("back view");
    expect(prompt.toLowerCase()).toContain("left profile");
    expect(prompt.toLowerCase()).toContain("right profile");
    expect(prompt.toLowerCase()).toContain("not a cinematic portrait");
    expect(prompt.toLowerCase()).toContain("head to toes");
  });

  it("uses single casting portrait layout for photoreal preset", () => {
    const prompt = buildCharacterSheetPromptTemplate(
      "April",
      "Blonde woman in a green dress",
      { preset: "photoreal_cinematic" }
    );
    expect(prompt.toLowerCase()).toContain("casting reference photograph");
    expect(prompt.toLowerCase()).toContain("single subject");
    expect(prompt.toLowerCase()).toContain("canon eos 5d mark iii");
    expect(prompt.toLowerCase()).not.toContain("front view, back view");
  });
});

describe("finalizeCharacterSheetPrompt", () => {
  it("appends layout suffix to bare appearance prompts for turnaround", () => {
    const prompt = finalizeCharacterSheetPrompt(
      "Dark angel with black wings and glowing red eyes",
      { preset: "animation_cartoon" }
    );
    expect(prompt.toLowerCase()).toContain("turnaround");
    expect(prompt.toLowerCase()).toContain("front view");
    expect(prompt.toLowerCase()).toContain("not cropped");
  });

  it("appends casting portrait suffix for photoreal", () => {
    const prompt = finalizeCharacterSheetPrompt(
      "Blonde woman in a green dress",
      { preset: "photoreal_cinematic" }
    );
    expect(prompt.toLowerCase()).toContain("casting reference photograph");
    expect(prompt.toLowerCase()).toContain("not a turnaround sheet");
  });
});

describe("buildCharacterSheetNegativePrompt", () => {
  it("includes turnaround anti-layout negatives for animation", () => {
    const negative = buildCharacterSheetNegativePrompt({
      preset: "animation_cartoon",
    });
    expect(negative.toLowerCase()).toContain("close-up");
    expect(negative.toLowerCase()).toContain("wings cut off");
    expect(negative.toLowerCase()).toContain("feet out of frame");
  });

  it("blocks turnaround and doll artifacts for photoreal casting", () => {
    const negative = buildCharacterSheetNegativePrompt({
      preset: "photoreal_cinematic",
    });
    expect(negative.toLowerCase()).toContain("turnaround sheet");
    expect(negative.toLowerCase()).toContain("two heads");
    expect(negative.toLowerCase()).toContain("doll");
  });
});

describe("buildCharacterSheetPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns template prompt when LLM is disabled", async () => {
    const result = await buildCharacterSheetPrompts("Kai", "Stoic knight", {
      preset: "animation_cartoon",
    });
    expect(result.usedLlm).toBe(false);
    expect(result.processedPrompt).toContain("Kai");
    expect(result.processedPrompt.toLowerCase()).toContain("turnaround");
    expect(result.negativePrompt).toBe(
      buildCharacterSheetNegativePrompt({ preset: "animation_cartoon" })
    );
  });
});

describe("resolveDefaultCharacterSheetTemplateId", () => {
  it("falls back to builtin template id", async () => {
    const { resolveDefaultCharacterSheetTemplateId, BUILTIN_CHARACTER_SHEET_TEMPLATE_ID } =
      await import("@/lib/db/seed-builtin-templates");
    expect(resolveDefaultCharacterSheetTemplateId(null)).toBe(
      BUILTIN_CHARACTER_SHEET_TEMPLATE_ID
    );
    expect(resolveDefaultCharacterSheetTemplateId("custom-id")).toBe("custom-id");
  });
});

describe("LLM fallback", () => {
  it("falls back to template on LLM failure", async () => {
    const { expandPromptWithLlm } = await import(
      "@/lib/services/llm-prompt-expand"
    );
    vi.mocked(expandPromptWithLlm).mockResolvedValueOnce({
      prompt: buildCharacterSheetPromptTemplate("Mira", "Forest ranger", {
        preset: "animation_cartoon",
      }),
      usedLlm: false,
    });

    const result = await buildCharacterSheetPrompts("Mira", "Forest ranger", {
      preset: "animation_cartoon",
    });
    expect(result.usedLlm).toBe(false);
    expect(result.processedPrompt).toContain("Mira");
  });
});

describe("buildLocationReferencePromptTemplate", () => {
  it("adds anchor consistency language when reframing from establishing shot", () => {
    const prompt = buildLocationReferencePromptTemplate(
      "Staircase hall",
      "Tight shot on the stairs",
      { preset: "photoreal_cinematic" },
      { anchorMode: true }
    );
    expect(prompt).toContain(LOCATION_REFERENCE_ANCHOR_PREFIX);
    expect(prompt.toLowerCase()).not.toContain("wide framing with full environment");
  });

  it("adds anchor negatives when reframing", () => {
    const negative = buildLocationReferenceNegativePrompt(
      { preset: "photoreal_cinematic" },
      { anchorMode: true }
    );
    expect(negative.toLowerCase()).toContain("wrong stair direction");
  });

  it("adds telephoto camera hints in anchor mode", () => {
    const prompt = buildLocationReferencePromptTemplate(
      "Staircase hall",
      "85mm tight shot looking straight down at the wet stone steps. Stormy night.",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription: "85mm tight shot looking straight down at the wet stone steps",
      }
    );
    expect(prompt.toLowerCase()).toContain("telephoto");
    expect(prompt.toLowerCase()).toContain("overhead");
  });

  it("does not infer overhead from state context pours down at", () => {
    const prompt = buildLocationReferencePromptTemplate(
      "Staircase hall",
      "Heavy rain pours down at a harsh angle. Chaotic weather.",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription: "extreme macro close-up, low camera, broken stone step",
      }
    );
    expect(prompt.toLowerCase()).not.toContain("overhead");
    expect(prompt.toLowerCase()).toContain("macro photography");
  });

  it("adds macro camera hints for extreme close-up angles", () => {
    const prompt = buildLocationReferencePromptTemplate(
      "Staircase hall",
      "extreme macro close-up, low camera, broken stone step. Storm context.",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription: "extreme macro close-up, low camera, broken stone step",
      }
    );
    expect(prompt.toLowerCase()).toContain("massive stone treads");
    expect(prompt.toLowerCase()).toContain("temple-scale");
    expect(prompt.toLowerCase()).toContain("fill most of the frame");
  });

  it("adds close-up negatives for macro anchor angles", () => {
    const negative = buildLocationReferenceNegativePrompt(
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription: "extreme macro close-up on stone step",
      }
    );
    expect(negative.toLowerCase()).toContain("wide establishing shot");
  });

  it("detects seamless backdrop locations", () => {
    expect(
      detectVirtualBackdropLocation(
        "Studio Gray",
        "Neutral gray seamless paper backdrop for casting portraits"
      )
    ).toBe(true);
    expect(
      detectVirtualBackdropLocation(
        "City deli",
        "Busy Manhattan street corner with neon signs"
      )
    ).toBe(false);
    expect(
      detectVirtualBackdropLocation(
        "City deli street (Storefront establishing)",
        "City deli street. Default look. background plate for portrait. Medium-wide shot facing the deli storefront from across the sidewalk."
      )
    ).toBe(false);
  });

  it("uses in-camera backdrop language instead of wide environment framing", () => {
    const prompt = buildLocationReferencePromptTemplate(
      "Studio Gray (Establishing wide)",
      "Studio Gray. Clean neutral gray seamless backdrop. Even soft light.",
      { preset: "photoreal_cinematic" },
      {
        viewDescription:
          "Wide shot, gray seamless fills the entire frame edge to edge, no equipment visible",
      }
    );
    expect(prompt).toContain(LOCATION_REFERENCE_BACKDROP_LAYOUT_PREFIX);
    expect(prompt.toLowerCase()).not.toContain(
      "wide framing with full environment visible"
    );
    expect(prompt.toLowerCase()).toContain("fills the entire frame edge to edge");
    expect(prompt.toLowerCase()).not.toContain("ultra detailed architecture");
  });

  it("adds BTS studio negatives for backdrop locations", () => {
    const negative = buildLocationReferenceNegativePrompt(
      { preset: "photoreal_cinematic" },
      {
        name: "Studio Gray",
        userDescription: "Neutral gray seamless backdrop",
      }
    );
    expect(negative.toLowerCase()).toContain("softboxes");
    expect(negative.toLowerCase()).toContain("behind the scenes");
  });
});

describe("resolveAnchorReframeIntensity", () => {
  it("detects extreme macro reframes", async () => {
    const { resolveAnchorReframeIntensity } = await import(
      "@/lib/services/prompt-preprocess"
    );
    expect(
      resolveAnchorReframeIntensity(
        "extreme macro close-up, low camera, broken stone step"
      )
    ).toBe("extreme");
  });

  it("detects moderate telephoto reframes", async () => {
    const { resolveAnchorReframeIntensity } = await import(
      "@/lib/services/prompt-preprocess"
    );
    expect(
      resolveAnchorReframeIntensity("85mm tight shot on the wet steps")
    ).toBe("moderate");
  });
});

describe("resolveShotReframeIntensity", () => {
  it("uses extreme reframe for rear close-ups", async () => {
    const { resolveShotReframeIntensity } = await import(
      "@/lib/services/prompt-preprocess"
    );
    expect(
      resolveShotReframeIntensity(
        "cinematic tight close-up on the back of Azrael"
      )
    ).toBe("extreme");
  });

  it("uses scene reframe for kneeling ensemble wide shots", async () => {
    const { resolveShotReframeIntensity } = await import(
      "@/lib/services/prompt-preprocess"
    );
    const prompt =
      "A cinematic wide shot of a glowing white angel kneeling on a crystalline floor with his head bowed. In the immediate foreground, two towering Seraphim frame the shot.";
    expect(resolveShotReframeIntensity(prompt)).toBe("scene");
  });

  it("uses character_lock for wide character-focused shots", async () => {
    const { resolveShotReframeIntensity } = await import(
      "@/lib/services/prompt-preprocess"
    );
    expect(
      resolveShotReframeIntensity("Wide master shot, full environment visible", {
        referenceFocus: "character",
      })
    ).toBe("character_lock");
  });

  it("uses moderate reframe for tight character-focused shots", async () => {
    const { resolveShotReframeIntensity } = await import(
      "@/lib/services/prompt-preprocess"
    );
    expect(
      resolveShotReframeIntensity("85mm f1.8 portrait, NYC deli exterior", {
        referenceFocus: "character",
      })
    ).toBe("moderate");
  });
});

describe("buildShotPlaceholderNegativePrompt", () => {
  it("adds front-view negatives for rear shots", async () => {
    const { buildShotPlaceholderNegativePrompt } = await import(
      "@/lib/services/prompt-preprocess"
    );
    const negative = buildShotPlaceholderNegativePrompt(
      { preset: "photoreal_cinematic" },
      "close-up on the back of Azrael"
    );
    expect(negative.toLowerCase()).toContain("front view");
    expect(negative.toLowerCase()).toContain("face visible");
    expect(negative.toLowerCase()).toContain("full body");
  });

  it("uses wide master camera hints for wide rear scene shots", async () => {
    const { buildShotCameraDirective, buildShotPlaceholderPromptTemplate } =
      await import("@/lib/services/prompt-preprocess");
    const prompt =
      "A cinematic wide shot from behind a tall angel with white wings. Two Seraphim in gold armor cross flaming swords. Highly detailed.";
    const camera = buildShotCameraDirective(prompt);
    expect(camera.toLowerCase()).toContain("wide cinematic master shot");
    expect(camera.toLowerCase()).not.toContain("macro close-up");

    const processed = buildShotPlaceholderPromptTemplate("Sentinels", prompt);
    expect(processed.toLowerCase()).not.toContain(
      "torn dark leathery wing tissue"
    );
    expect(processed.toLowerCase()).not.toContain("not a wide shot");
  });

  it("adds kneeling pose hints and standing negatives for action shots", async () => {
    const {
      buildShotCameraDirective,
      buildShotPlaceholderNegativePrompt,
    } = await import("@/lib/services/prompt-preprocess");
    const prompt =
      "A cinematic wide shot of an angel kneeling with his head bowed and wings spread open in submission.";
    const camera = buildShotCameraDirective(prompt);
    expect(camera.toLowerCase()).toContain("kneeling");
    expect(camera.toLowerCase()).toContain("head bowed");

    const negative = buildShotPlaceholderNegativePrompt(
      { preset: "photoreal_cinematic" },
      prompt
    );
    expect(negative.toLowerCase()).toContain("standing upright");
  });
});
