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
  /** Still canvas (diffusion bucket) for character sheets, locations, storyboard stills. */
  width: number;
  height: number;
  /** Delivery video size. Renders and exports conform here. */
  videoWidth: number;
  videoHeight: number;
}

export const REFERENCE_ASPECT_RATIO_PRESETS: Record<
  ReferenceAspectRatioPreset,
  ReferenceAspectRatioDefinition
> = {
  "16_9": {
    id: "16_9",
    label: "16:9 widescreen",
    description: "Standard HD landscape.",
    width: 1344,
    height: 768,
    videoWidth: 1920,
    videoHeight: 1080,
  },
  "9_16": {
    id: "9_16",
    label: "9:16 vertical",
    description: "Portrait / mobile vertical framing.",
    width: 768,
    height: 1344,
    videoWidth: 1080,
    videoHeight: 1920,
  },
  "21_9": {
    id: "21_9",
    label: "21:9 ultrawide",
    description: "Cinematic ultrawide landscape.",
    width: 1344,
    height: 576,
    videoWidth: 2560,
    videoHeight: 1080,
  },
  "2_1": {
    id: "2_1",
    label: "2:1 wide",
    description: "Extra-wide landscape, good for character turnaround sheets.",
    width: 1536,
    height: 768,
    videoWidth: 2160,
    videoHeight: 1080,
  },
  "1_1": {
    id: "1_1",
    label: "1:1 square",
    description: "Square framing for symmetric references.",
    width: 1024,
    height: 1024,
    videoWidth: 1080,
    videoHeight: 1080,
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
  return `${def.label} (video ${def.videoWidth}×${def.videoHeight})`;
}

/** Video output size for the preset, unless the user typed other numbers. */
export function resolveVideoDimensionsForAspectRatio(
  projectPreset?: ReferenceAspectRatioPreset | null
): { width: number; height: number } {
  const def = resolveReferenceAspectRatio(projectPreset);
  return { width: def.videoWidth, height: def.videoHeight };
}

/**
 * Template hydrate writes landscape 1920x1080 or 1344x768 even when the
 * project preset is 9:16, and older projects saved the still canvas as the
 * video size. A saved size equal to the preset's still canvas is upgraded to
 * the delivery size. Otherwise keep a saved size that matches the preset
 * shape, and replace one that does not (a landscape leftover on a portrait
 * project). Keep any other pair the user typed, such as 1080x1920.
 */
export function alignVideoSizeToReferenceAspect(settings: {
  referenceAspectRatio?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
}): { videoWidth: number; videoHeight: number } {
  const preset = parseReferenceAspectRatio(settings.referenceAspectRatio);
  const stillCanvas = resolveReferenceAspectRatio(preset);
  const ref = resolveVideoDimensionsForAspectRatio(preset);
  const width = settings.videoWidth;
  const height = settings.videoHeight;
  if (width == null || height == null || !width || !height) {
    return { videoWidth: ref.width, videoHeight: ref.height };
  }
  if (width === stillCanvas.width && height === stillCanvas.height) {
    return { videoWidth: ref.width, videoHeight: ref.height };
  }
  if (width === ref.width && height === ref.height) {
    return { videoWidth: ref.width, videoHeight: ref.height };
  }
  const videoAspect = width / height;
  const refAspect = ref.width / ref.height;
  if (Math.abs(videoAspect - refAspect) < 0.12) {
    return { videoWidth: width, videoHeight: height };
  }
  return { videoWidth: ref.width, videoHeight: ref.height };
}

/** Fill video width and height from the project still ratio. */
export function applyProjectAspectRatioToRenderSettings<
  T extends {
    referenceAspectRatio?: string | null;
    videoWidth?: number | null;
    videoHeight?: number | null;
  },
>(settings: T): T {
  const aligned = alignVideoSizeToReferenceAspect(settings);
  return {
    ...settings,
    videoWidth: aligned.videoWidth,
    videoHeight: aligned.videoHeight,
  };
}

/** Character sheet canvas matches the project reference aspect ratio preset (default 16:9). */
export function resolveCharacterSheetReferenceDimensions(
  _style: VisualStyle,
  projectPreset?: ReferenceAspectRatioPreset | null
): { width: number; height: number } {
  const def = resolveReferenceAspectRatio(projectPreset);
  return { width: def.width, height: def.height };
}

/** Front+back diptych canvas: double width so each half matches the single-panel preset (e.g. 2688×768 → two 1344×768 panels). */
export function resolveFrontBackDiptychDimensions(
  style: VisualStyle,
  projectPreset?: ReferenceAspectRatioPreset | null
): { width: number; height: number } {
  const single = resolveCharacterSheetReferenceDimensions(style, projectPreset);
  return { width: single.width * 2, height: single.height };
}
