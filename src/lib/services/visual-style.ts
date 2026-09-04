export type VisualStylePreset =
  | "photoreal_cinematic"
  | "stylized_illustration"
  | "animation_cartoon"
  | "custom";

export interface VisualStyle {
  preset: VisualStylePreset;
  /** Used when preset is `custom`; appended to character sheets and shot prompts. */
  customSuffix?: string;
}

export type CharacterSheetLayoutMode = "turnaround" | "casting_portrait";

export interface VisualStylePresetDefinition {
  id: VisualStylePreset;
  label: string;
  description: string;
  characterSheetLayout: CharacterSheetLayoutMode;
  characterSheetTheme: string;
  locationReferenceTheme: string;
  shotSuffix: string;
  negativeExtras: string;
  llmCharacterSheetHint: string;
}

export const VISUAL_STYLE_PRESETS: Record<
  VisualStylePreset,
  VisualStylePresetDefinition
> = {
  photoreal_cinematic: {
    id: "photoreal_cinematic",
    label: "Photo-real cinematic",
    description:
      "Live-action look, casting-style references and cinematic shot footage.",
    characterSheetLayout: "casting_portrait",
    characterSheetTheme:
      "Live-action casting reference photograph, natural skin texture and pores, realistic subsurface skin, muted natural color grading, not oversaturated",
    locationReferenceTheme:
      "Photorealistic environment reference, cinematic production design, natural and practical lighting, ultra detailed architecture and set dressing.",
    shotSuffix:
      "cinematic photorealistic footage, shot on 35mm film, natural lighting, shallow depth of field",
    negativeExtras:
      "cartoon, anime, illustration, drawing, cel shaded, painted, 3d render look, doll, figurine, plastic skin, wax figure, oversaturated, artificial lighting",
    llmCharacterSheetHint:
      "a single live-action casting reference photograph with one subject in one pose (not a turnaround sheet)",
  },
  stylized_illustration: {
    id: "stylized_illustration",
    label: "Stylized illustration",
    description:
      "Painterly or illustrated look, not photo-real, not flat cartoon.",
    characterSheetLayout: "turnaround",
    characterSheetTheme:
      "Stylized illustration character design, consistent design across all views, painterly detail, rich color.",
    locationReferenceTheme:
      "Stylized illustrated environment, painterly production design, rich color and atmosphere.",
    shotSuffix:
      "stylized digital illustration, painterly, rich saturated color, art-directed frame",
    negativeExtras: "photorealistic, photograph, uncanny valley, live action",
    llmCharacterSheetHint:
      "stylized illustration character turnaround reference sheet on a single image",
  },
  animation_cartoon: {
    id: "animation_cartoon",
    label: "Animation / cartoon",
    description:
      "Classic animation model sheets and cel-style frames.",
    characterSheetLayout: "turnaround",
    characterSheetTheme:
      "Professional animation character design, consistent model sheet design across all views, clean line art, high detail, character design document.",
    locationReferenceTheme:
      "Animation background layout, clean environment design, color keys, production art quality.",
    shotSuffix: "2D animation style, clean lines, cel shaded, animation frame",
    negativeExtras: "photorealistic, photograph, live action, hyperreal",
    llmCharacterSheetHint:
      "animation character turnaround reference sheet on a single image",
  },
  custom: {
    id: "custom",
    label: "Custom",
    description:
      "Your own look: add a style phrase applied to every generation.",
    characterSheetLayout: "turnaround",
    characterSheetTheme:
      "Character design matching the project's custom visual style, consistent appearance across all views, high detail.",
    locationReferenceTheme:
      "Environment reference matching the project's custom visual style, high detail.",
    shotSuffix: "",
    negativeExtras: "",
    llmCharacterSheetHint:
      "character turnaround reference sheet on a single image matching the project's custom visual style",
  },
};

export const DEFAULT_VISUAL_STYLE: VisualStyle = {
  preset: "photoreal_cinematic",
};

export function parseVisualStyle(raw: string | null | undefined): VisualStyle {
  if (!raw || raw.trim() === "" || raw === "{}") {
    return { ...DEFAULT_VISUAL_STYLE };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<VisualStyle>;
    if (
      parsed.preset &&
      parsed.preset in VISUAL_STYLE_PRESETS
    ) {
      const customSuffix = parsed.customSuffix?.trim();
      return {
        preset: parsed.preset,
        customSuffix: customSuffix || undefined,
      };
    }
  } catch {
    /* use default */
  }
  return { ...DEFAULT_VISUAL_STYLE };
}

export function serializeVisualStyle(style: VisualStyle): string {
  const payload: VisualStyle = { preset: style.preset };
  if (style.preset === "custom" && style.customSuffix?.trim()) {
    payload.customSuffix = style.customSuffix.trim();
  }
  return JSON.stringify(payload);
}

export function getCharacterSheetLayoutMode(
  style: VisualStyle
): CharacterSheetLayoutMode {
  return getVisualStyleDefinition(style).characterSheetLayout;
}

export function getVisualStyleDefinition(
  style: VisualStyle
): VisualStylePresetDefinition {
  return VISUAL_STYLE_PRESETS[style.preset];
}

export function getVisualStyleLabel(style: VisualStyle): string {
  const def = getVisualStyleDefinition(style);
  if (style.preset === "custom" && style.customSuffix) {
    return `${def.label}: ${style.customSuffix}`;
  }
  return def.label;
}

function resolveStyleSuffix(style: VisualStyle): string {
  const def = getVisualStyleDefinition(style);
  if (style.preset === "custom") {
    return style.customSuffix?.trim() ?? "";
  }
  return def.shotSuffix;
}

export function applyVisualStyleToShotPrompt(
  prompt: string,
  style: VisualStyle
): string {
  const base = prompt.trim();
  const suffix = resolveStyleSuffix(style);
  if (!suffix) return base;
  if (!base) return suffix;
  if (base.toLowerCase().includes(suffix.toLowerCase())) return base;
  return `${base}, ${suffix}`;
}

export function getVisualStyleNegativeExtras(style: VisualStyle): string {
  if (style.preset === "custom") return "";
  return getVisualStyleDefinition(style).negativeExtras;
}

export function mergeNegativePrompts(...parts: (string | undefined)[]): string {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of parts) {
    if (!part?.trim()) continue;
    for (const token of part.split(",").map((t) => t.trim()).filter(Boolean)) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(token);
    }
  }
  return tokens.join(", ");
}
