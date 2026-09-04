import type { VisualStyle } from "@/lib/services/visual-style";

export type ReferenceAspectRatioPreset =
  | "16_9"
  | "9_16"
  | "21_9"
  | "2_1"
  | "1_1";

export interface ReferenceAspectRatioDefinition {
  id: ReferenceAspectRatioPreset;
  label: string;
  description: string;
  width: number;
  height: number;
}

export const REFERENCE_ASPECT_RATIO_PRESETS: Record<
  ReferenceAspectRatioPreset,
  ReferenceAspectRatioDefinition
> = {
  "16_9": {
    id: "16_9",
    label: "16:9 widescreen",
    description: "Standard HD landscape. Default for location references and shots.",
    width: 1344,
    height: 768,
  },
  "9_16": {
    id: "9_16",
    label: "9:16 vertical",
    description: "Portrait / mobile vertical framing.",
    width: 768,
    height: 1344,
  },
  "21_9": {
    id: "21_9",
    label: "21:9 ultrawide",
    description: "Cinematic ultrawide landscape.",
    width: 1344,
    height: 576,
  },
  "2_1": {
    id: "2_1",
    label: "2:1 wide",
    description: "Extra-wide landscape, good for character turnaround sheets.",
    width: 1536,
    height: 768,
  },
  "1_1": {
    id: "1_1",
    label: "1:1 square",
    description: "Square framing for symmetric references.",
    width: 1024,
    height: 1024,
  },
};

export const DEFAULT_REFERENCE_ASPECT_RATIO: ReferenceAspectRatioPreset = "16_9";

export function parseReferenceAspectRatio(
  raw: string | undefined | null
): ReferenceAspectRatioPreset {
  if (raw && raw in REFERENCE_ASPECT_RATIO_PRESETS) {
    return raw as ReferenceAspectRatioPreset;
  }
  return DEFAULT_REFERENCE_ASPECT_RATIO;
}

export function resolveReferenceAspectRatio(
  preset: ReferenceAspectRatioPreset | undefined | null
): ReferenceAspectRatioDefinition {
  return REFERENCE_ASPECT_RATIO_PRESETS[
    parseReferenceAspectRatio(preset ?? undefined)
  ];
}

export function getReferenceAspectRatioLabel(
  preset: ReferenceAspectRatioPreset | undefined | null
): string {
  const def = resolveReferenceAspectRatio(preset);
  return `${def.label} (${def.width}×${def.height})`;
}

/** Character sheet canvas matches the project reference aspect ratio preset. */
export function resolveCharacterSheetReferenceDimensions(
  _style: VisualStyle,
  projectPreset?: ReferenceAspectRatioPreset | null
): { width: number; height: number } {
  const def = resolveReferenceAspectRatio(projectPreset);
  return { width: def.width, height: def.height };
}
