/** Client-safe builtin workflow template IDs (no Node/fs imports). */

export const BUILTIN_CHARACTER_SHEET_TEMPLATE_ID = "builtin-character-sheet-v1";
export const BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID =
  "builtin-location-reference-img2img-v1";
export const BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID =
  "builtin-location-reference-ipadapter-v1";
export const BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID =
  "builtin-shot-dual-ipadapter-v1";
export const BUILTIN_LTX_I2V_TEMPLATE_ID = "builtin-ltx-i2v-v1";
export const BUILTIN_MINIMAX_I2V_TEMPLATE_ID = "builtin-minimax-i2v-v1";

/** Model auto-detect hints passed to ComfyUI render-settings hydration. */
export function resolveTemplateVideoHints(templateId: string): string[] {
  if (templateId === BUILTIN_MINIMAX_I2V_TEMPLATE_ID) {
    return ["minimax", "h3", "fl2va"];
  }
  if (templateId === BUILTIN_LTX_I2V_TEMPLATE_ID) {
    return ["ltx"];
  }
  return ["ltx", "minimax"];
}

export function resolveTemplateVideoEngine(
  templateId: string
): "ltx" | "minimax" | "generic" {
  if (templateId === BUILTIN_MINIMAX_I2V_TEMPLATE_ID) return "minimax";
  if (templateId === BUILTIN_LTX_I2V_TEMPLATE_ID) return "ltx";
  return "generic";
}
