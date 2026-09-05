/** Client-safe builtin workflow template IDs (no Node/fs imports). */

export const BUILTIN_CHARACTER_SHEET_TEMPLATE_ID = "builtin-character-sheet-v1";
export const BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID =
  "builtin-location-reference-img2img-v1";
export const BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID =
  "builtin-location-reference-ipadapter-v1";
export const BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID =
  "builtin-shot-dual-ipadapter-v1";
export const BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID =
  "builtin-shot-location-plate-v1";
export const BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID =
  "builtin-shot-character-isolate-v1";
export const BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID =
  "builtin-shot-composite-inpaint-v1";
export const BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID =
  "builtin-shot-scene-integrate-inpaint-v1";
export const BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID =
  "builtin-shot-scene-edit-qwen-v1";
export const BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID =
  "builtin-shot-face-refine-v1";
export const BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID =
  "builtin-shot-image-edit-qwen-v1";

export const SHOT_COMPOSITING_TEMPLATE_IDS = [
  BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID,
  BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID,
  BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID,
] as const;
export const BUILTIN_LTX_I2V_TEMPLATE_ID = "builtin-ltx-i2v-v1";
export const BUILTIN_LTX_I2V_AUDIO_TEMPLATE_ID = "builtin-ltx-i2v-audio-v1";
export const BUILTIN_MINIMAX_I2V_TEMPLATE_ID = "builtin-minimax-i2v-v1";
export const BUILTIN_KREA2_STILL_TEMPLATE_ID = "builtin-krea2-still-v1";

export function isKrea2StillTemplate(templateId: string): boolean {
  return templateId === BUILTIN_KREA2_STILL_TEMPLATE_ID;
}

/** Model auto-detect hints for Krea 2 still-image workflows. */
export function resolveTemplateImageHints(templateId: string): string[] {
  if (templateId === BUILTIN_KREA2_STILL_TEMPLATE_ID) {
    return ["krea2", "krea", "turbo"];
  }
  return [];
}

export function resolveTemplateImageEngine(
  templateId: string
): "krea2" | "sdxl" {
  return isKrea2StillTemplate(templateId) ? "krea2" : "sdxl";
}

/** Model auto-detect hints passed to ComfyUI render-settings hydration. */
export function resolveTemplateVideoHints(templateId: string): string[] {
  if (templateId === BUILTIN_MINIMAX_I2V_TEMPLATE_ID) {
    return ["minimax", "h3", "fl2va"];
  }
  if (
    templateId === BUILTIN_LTX_I2V_TEMPLATE_ID ||
    templateId === BUILTIN_LTX_I2V_AUDIO_TEMPLATE_ID
  ) {
    return ["ltx"];
  }
  return ["ltx", "minimax"];
}

export function resolveTemplateVideoEngine(
  templateId: string
): "ltx" | "minimax" | "generic" {
  if (templateId === BUILTIN_MINIMAX_I2V_TEMPLATE_ID) return "minimax";
  if (
    templateId === BUILTIN_LTX_I2V_TEMPLATE_ID ||
    templateId === BUILTIN_LTX_I2V_AUDIO_TEMPLATE_ID
  ) {
    return "ltx";
  }
  return "generic";
}
