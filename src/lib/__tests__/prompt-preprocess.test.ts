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
    expect(prompt.toLowerCase()).toContain("single photograph");
    expect(prompt.toLowerCase()).toContain("one person");
    expect(prompt.toLowerCase()).toContain("16:9");
    expect(prompt.toLowerCase()).not.toContain("front view, back view");
  });

  it("uses front+back diptych layout when requested", () => {
    const prompt = buildCharacterSheetPromptTemplate(
      "Mira",
      "Olive trench coat, dark jeans, black boots",
      { preset: "photoreal_cinematic" },
      { frontBackDiptych: true }
    );
    expect(prompt.toLowerCase()).toContain("two panels");
    expect(prompt.toLowerCase()).toContain("left panel");
    expect(prompt.toLowerCase()).toContain("right panel");
    expect(prompt.toLowerCase()).not.toContain("not diptych");
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
    expect(prompt.toLowerCase()).toContain("single photograph");
    expect(prompt.toLowerCase()).toContain("one person");
  });

  it("appends layout prefix when draft omits casting guards", () => {
    const llmLike =
      "Live-action casting reference photograph of a punk woman, single subject, full body head to toe, studded leather vest.";
    const prompt = finalizeCharacterSheetPrompt(llmLike, {
      preset: "photoreal_cinematic",
    });
    expect(prompt.toLowerCase()).toContain("single photograph");
    expect(prompt.toLowerCase()).toContain("one pose");
  });

  it("strips turnaround layout words from user description for photoreal", () => {
    const prompt = buildCharacterSheetPromptTemplate(
      "Lisa",
      "Punk fighter, character sheet, front view and back view, green pants",
      { preset: "photoreal_cinematic" }
    );
    expect(prompt.toLowerCase()).not.toContain("front view");
    expect(prompt.toLowerCase()).not.toContain("back view");
    expect(prompt.toLowerCase()).not.toContain("character sheet");
    expect(prompt.toLowerCase()).toContain("green pants");
  });

  it("puts triptych negatives first for CLIP token limit", () => {
    const negative = buildCharacterSheetNegativePrompt({
      preset: "photoreal_cinematic",
    });
    expect(negative.toLowerCase().indexOf("triptych")).toBeLessThan(20);
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

  it("blocks turnaround, split layouts, and doll artifacts for photoreal casting", () => {
    const negative = buildCharacterSheetNegativePrompt({
      preset: "photoreal_cinematic",
    });
    expect(negative.toLowerCase()).toContain("turnaround sheet");
    expect(negative.toLowerCase()).toContain("triptych");
    expect(negative.toLowerCase()).toContain("split screen");
    expect(negative.toLowerCase()).toContain("diptych");
    expect(negative.toLowerCase()).toContain("two people");
    expect(negative.toLowerCase()).toContain("generic model face");
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

describe("buildCharacterSheetPromptTemplate anchored angles", () => {
  it("uses rear-view prefix instead of front three-quarter for back angles", () => {
    const prompt = buildCharacterSheetPromptTemplate(
      "Lisa (Back full body)",
      "We only see the back of their head, green pants, tramp stamp. Blonde punk fighter.",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription:
          "We only see the back of their head, green pants, tramp stamp",
      }
    );
    expect(prompt.toLowerCase()).toContain("turned away from camera");
    expect(prompt.toLowerCase()).toContain("face not visible");
    expect(prompt.toLowerCase()).not.toContain("front three-quarter view");
    expect(prompt.toLowerCase()).toContain("same wardrobe");
  });

  it("adds rear-view negatives and removes back-view penalties for anchored back angles", () => {
    const negative = buildCharacterSheetNegativePrompt(
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription: "Back of head, facing away from camera",
      }
    );
    expect(negative.toLowerCase()).toContain("looking at camera");
    expect(negative.toLowerCase()).toContain("face visible");
    expect(negative.toLowerCase()).not.toContain("deformed, back view");
    expect(negative.toLowerCase()).not.toContain("deformed, rear view");
  });

  it("buildCharacterSheetPrompts applies anchored rear template without LLM", async () => {
    const result = await buildCharacterSheetPrompts(
      "Lisa (Back full body)",
      "Back of head, green cargo pants. Blonde woman with red headband.",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription: "Back of head, facing away from camera, tramp stamp",
      }
    );
    expect(result.usedLlm).toBe(false);
    expect(result.processedPrompt.toLowerCase()).toContain("turned away");
    expect(result.processedPrompt.toLowerCase()).toContain("not a diptych");
    expect(result.processedPrompt.toLowerCase()).not.toContain(
      "front three-quarter view"
    );
    expect(result.processedPrompt.toLowerCase()).not.toContain("green-hazel eyes");
  });

  it("strips forward-facing face lines from rear view appearance text", async () => {
    const { sanitizeRearViewAppearanceDesc } = await import(
      "@/lib/services/prompt-preprocess"
    );
    const cleaned = sanitizeRearViewAppearanceDesc(
      "Wide green-hazel eyes, neutral expression. Black studded leather vest, green cargo pants."
    );
    expect(cleaned.toLowerCase()).not.toContain("green-hazel eyes");
    expect(cleaned.toLowerCase()).toContain("black studded leather vest");
  });

  it("dedupes view description from appearance block for anchored angles", () => {
    const prompt = buildCharacterSheetPromptTemplate(
      "Lisa (Back full body)",
      "Back of head, green pants. Blonde punk fighter.",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription: "Back of head, green pants",
      }
    );
    expect(prompt.toLowerCase()).toMatch(/wardrobe and build: blonde punk fighter\./);
  });

  it("uses compact solo rear path without anchor language for prompt-only back angles", () => {
    const prompt = buildCharacterSheetPromptTemplate(
      "Lisa (Punk Back)",
      "Nape exposed, studded vest, black leather pants. Mid-20s woman. Wide green-hazel eyes.",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: false,
        viewDescription:
          "Messy blonde hair, nape exposed, studded vest between shoulder blades, black leather pants, boots",
      }
    );
    expect(prompt.toLowerCase()).toContain("not diptych");
    expect(prompt.toLowerCase()).toContain("16:9");
    expect(prompt.toLowerCase()).not.toContain("vertical portrait");
    expect(prompt.toLowerCase()).not.toContain("anchor reference");
    expect(prompt.toLowerCase()).not.toContain("front-and-back comparison");
    expect(prompt.toLowerCase()).not.toContain("green-hazel eyes");
    expect(prompt.toLowerCase()).not.toContain("wardrobe:");
  });

  it("does not prepend front casting prefix to compact rear solo prompts", () => {
    const draft = buildCharacterSheetPromptTemplate(
      "Lisa (Punk Back)",
      "Nape exposed, studded vest, black leather pants.",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: false,
        viewDescription:
          "Messy blonde hair, nape exposed, studded vest between shoulder blades, black leather pants, boots",
      }
    );
    const prompt = finalizeCharacterSheetPrompt(draft, {
      preset: "photoreal_cinematic",
    });
    expect(prompt.toLowerCase()).not.toContain("front three-quarter view");
    expect(prompt.toLowerCase()).toContain("back toward camera");
    expect(prompt.toLowerCase()).not.toContain(
      "single photograph, one person, one pose, one camera angle, full body head to toe, 16:9 widescreen, front three-quarter"
    );
  });

  it("prepends extra rear anti-panel negatives for solo back angles", () => {
    const negative = buildCharacterSheetNegativePrompt(
      { preset: "photoreal_cinematic" },
      {
        viewDescription: "Nape exposed, studded vest, black leather pants",
      }
    );
    expect(negative.toLowerCase().indexOf("diptych")).toBeLessThan(10);
    expect(negative.toLowerCase()).toContain("double portrait");
  });

  it("adds anchored anti-panel negatives for subsequent angles", () => {
    const negative = buildCharacterSheetNegativePrompt(
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription: "Profile from the left",
      }
    );
    expect(negative.toLowerCase()).toContain("double portrait");
    expect(negative.toLowerCase()).toContain("front and back in one image");
  });
});

describe("resolveCharacterAnchorReframeIntensity", () => {
  it("uses scene profile for back and rear views", async () => {
    const { resolveCharacterAnchorReframeIntensity } = await import(
      "@/lib/anchor-reframe"
    );
    expect(
      resolveCharacterAnchorReframeIntensity(
        "Back of head, facing away from camera. Green pants."
      )
    ).toBe("scene");
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

  it("does not invent temple stairs for a plain room close-up", () => {
    const prompt = buildLocationReferencePromptTemplate(
      "Dragon Lair",
      "the same room and lair, table on the right with candles, Close up out of focus background plate for a portrait",
      { preset: "photoreal_cinematic" },
      {
        anchorMode: true,
        viewDescription:
          "the same room and lair, table on the right with candles, Close up out of focus background plate for a portrait",
      }
    );
    expect(prompt.toLowerCase()).not.toContain("massive stone treads");
    expect(prompt.toLowerCase()).not.toContain("temple-scale");
    expect(prompt.toLowerCase()).not.toContain("staircase");
    expect(prompt.toLowerCase()).toContain("same physical location");
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

  it("keeps character-sheet background negatives even when a location reference is used", async () => {
    const { buildShotPlaceholderNegativePrompt } = await import(
      "@/lib/services/prompt-preprocess"
    );
    const negative = buildShotPlaceholderNegativePrompt(
      { preset: "photoreal_cinematic" },
      "Medium shot of Mira under the platform light",
      { hasLocationReference: true }
    );
    expect(negative.toLowerCase()).toContain("neutral gray backdrop");
    expect(negative.toLowerCase()).toContain("character sheet pose");
  });

  it("wraps scene edit prompts as an edit instruction and leaves negatives alone", async () => {
    const {
      applyShotReferenceModePromptExtras,
      SHOT_SCENE_EDIT_INSTRUCTION_PREFIX,
      SHOT_SCENE_EDIT_INSTRUCTION_SUFFIX,
    } = await import("@/lib/services/prompt-preprocess");
    const result = applyShotReferenceModePromptExtras(
      "Wide establishing view of the full environment. Lisa opening the deli door and stepping inside",
      "blurry",
      {
        effectiveMode: "scene_edit",
        useDualIpAdapter: false,
        useCompositingPipeline: false,
      }
    );
    expect(result.processedPrompt.startsWith(SHOT_SCENE_EDIT_INSTRUCTION_PREFIX)).toBe(
      true
    );
    expect(result.processedPrompt).toContain(SHOT_SCENE_EDIT_INSTRUCTION_SUFFIX);
    expect(result.processedPrompt).toContain("opening the deli door");
    // Establishing-view framing line invites empty scenery; stripped like integrate.
    expect(result.processedPrompt).not.toContain("Wide establishing view");
    // CFG 1.0 ignores negatives; no SDXL negative stack appended.
    expect(result.negativePrompt).toBe("blurry");
  });

  it("adds integrate-in-scene suffix and negatives for integrate mode", async () => {
    const { applyShotReferenceModePromptExtras, SHOT_INTEGRATE_IN_SCENE_SUFFIX } =
      await import("@/lib/services/prompt-preprocess");
    const result = applyShotReferenceModePromptExtras(
      "Medium shot in the park",
      "blurry",
      {
        effectiveMode: "integrate_in_scene",
        useDualIpAdapter: false,
        useCompositingPipeline: false,
      }
    );
    expect(result.processedPrompt).toContain(SHOT_INTEGRATE_IN_SCENE_SUFFIX);
    expect(result.processedPrompt).toContain("natural human scale");
    expect(result.processedPrompt).toContain("not leaning on anything");
    expect(result.negativePrompt).toContain("pasted cutout");
    expect(result.negativePrompt).toContain("oversized subject");
    expect(result.negativePrompt).toContain("leaning on empty air");
  });

  it("skips anti-lean extras when the shot prompt asks for a supported pose", async () => {
    const { applyShotReferenceModePromptExtras } = await import(
      "@/lib/services/prompt-preprocess"
    );
    const result = applyShotReferenceModePromptExtras(
      "Lisa leaning against the deli doorway, smoking",
      "blurry",
      {
        effectiveMode: "integrate_in_scene",
        useDualIpAdapter: false,
        useCompositingPipeline: false,
      }
    );
    expect(result.processedPrompt).not.toContain("not leaning on anything");
    expect(result.negativePrompt).not.toContain("leaning on empty air");
    expect(result.negativePrompt).toContain("oversized subject");
  });

  it("detects supported pose intent for sitting and leaning prompts", async () => {
    const { detectSupportedPoseIntent } = await import(
      "@/lib/services/prompt-preprocess"
    );
    expect(detectSupportedPoseIntent("she leans on the counter")).toBe(true);
    expect(detectSupportedPoseIntent("seated at a park bench")).toBe(true);
    expect(detectSupportedPoseIntent("sitting on the curb")).toBe(true);
    expect(detectSupportedPoseIntent("resting a hand on the railing")).toBe(true);
    expect(detectSupportedPoseIntent("running through the rain")).toBe(false);
    expect(detectSupportedPoseIntent("walking past the bakery")).toBe(false);
  });
});
