/**
 * Industry-standard still techniques DiffuseCut should map providers onto.
 * Kept as documentation + helpers, not another preprocess hammer.
 */

import type { StillBrief, StillRef, StillTechnique } from "./still-brief";

export type TechniqueGuide = {
  id: StillTechnique;
  name: string;
  whenToUse: string;
  industryAnalog: string;
  local3090Note: string;
  cloudNote: string;
};

export const STILL_TECHNIQUE_GUIDE: TechniqueGuide[] = [
  {
    id: "multi_ref_native",
    name: "Native multi-reference compose",
    whenToUse:
      "Character + set + optional prop in one shot. Highest continuity for storyboard seeds.",
    industryAnalog:
      "Google Gemini Image (Nano Banana / Imagen multimodal). Cursor GenerateImage uses this family. Flux Kontext multi-image. Ideogram character+scene.",
    local3090Note:
      "Hard to match on SDXL+IP alone. Flux + Redux / Kontext-class graphs on 24GB are the closest open path; quality still lags frontier multimodal edit models.",
    cloudNote:
      "Preferred path for Sand Storm–class seeds. Wire Google AI image API or fal Flux Kontext.",
  },
  {
    id: "identity_style_split",
    name: "Identity vs style/set split",
    whenToUse:
      "Need wardrobe/face lock separate from world lock (different strengths).",
    industryAnalog:
      "Midjourney --cref (character) + --sref (style/set). Some apps expose dual reference weights.",
    local3090Note:
      "Two IP-Adapter chains with different weights can approximate this; fragile and easy to over-constrain.",
    cloudNote: "Midjourney bridge or any API that exposes dual ref slots.",
  },
  {
    id: "id_adapter",
    name: "Face / ID adapter",
    whenToUse: "Talking-head likeness when a face must hold across angles.",
    industryAnalog: "InstantID, PuLID-Flux, IP-Adapter FaceID.",
    local3090Note: "Viable on Comfy for humans. Weak for wrapped/goggled faces (Azmual class).",
    cloudNote: "Often unnecessary if multi_ref_native already holds silhouette + wardrobe.",
  },
  {
    id: "ip_adapter",
    name: "General IP-Adapter / Redux lock",
    whenToUse: "Single sheet or establishing plate continuity.",
    industryAnalog: "IP-Adapter Plus, Flux Redux.",
    local3090Note:
      "Current DiffuseCut default. Works for plates. Breaks when stacked with turbo samplers or conflicting prompt soup.",
    cloudNote: "Use only when the cloud model lacks native multi-ref.",
  },
  {
    id: "instruction_edit",
    name: "Instructional image edit",
    whenToUse:
      "Keep the plate pixels; change pose, insert subject, or open a prop reveal.",
    industryAnalog: "Flux Kontext, Qwen Image Edit, Gemini image edit turns.",
    local3090Note: "Qwen edit stack if installed. Otherwise skip.",
    cloudNote: "Strong cloud option when you already have a good plate.",
  },
  {
    id: "img2img_continuity",
    name: "Low-denoise continuity",
    whenToUse: "Small camera nudge without reinventing the world.",
    industryAnalog: "Classic img2img denoise 0.25–0.45.",
    local3090Note: "Reliable and cheap. Does not invent hidden surfaces.",
    cloudNote: "Same idea via edit APIs.",
  },
  {
    id: "optical_punch_in",
    name: "Optical punch-in",
    whenToUse: "Same axis, tighter framing, identical pixels.",
    industryAnalog: "Editorial crop + lanczos. Not generative.",
    local3090Note: "Already in DiffuseCut. Keep as a tool, never as Auto for walk-ups.",
    cloudNote: "Do locally; no need to spend API credits.",
  },
  {
    id: "prompt_only",
    name: "Prompt only",
    whenToUse: "Casting exploration, mood frames, no continuity required.",
    industryAnalog: "Any text-to-image model without reference conditioning.",
    local3090Note: "Krea 2 turbo is fine here.",
    cloudNote: "Fine for exploration; do not use as storyboard seed without refs.",
  },
  {
    id: "external_import",
    name: "External import inbox",
    whenToUse:
      "Operator generated in Midjourney, NightCafe, Cursor, Discord, etc.",
    industryAnalog: "Asset ingest. The film OS still owns canon + shot attach.",
    local3090Note: "Always available.",
    cloudNote: "First-class provider so cloud tools are not a DiffuseCut bypass.",
  },
];

export function refsByRole(brief: StillBrief, role: StillRef["role"]): StillRef[] {
  return brief.refs.filter((r) => r.role === role);
}

export function recommendTechnique(brief: StillBrief): StillTechnique {
  if (brief.technique) return brief.technique;
  const roles = new Set(brief.refs.map((r) => r.role));
  if (roles.has("identity") && roles.has("set")) return "multi_ref_native";
  if (roles.has("identity") && roles.has("style")) return "identity_style_split";
  if (roles.has("identity")) return "id_adapter";
  if (roles.has("set") && brief.prompt.toLowerCase().includes("punch")) {
    return "optical_punch_in";
  }
  if (roles.has("set")) return "ip_adapter";
  return "prompt_only";
}

/**
 * Build the exact prompt string for harness-off compose.
 * Only appends an optional short style lock when the caller opts in.
 */
export function resolvePromptSent(
  brief: StillBrief,
  styleLockPhrase?: string
): string {
  const base = brief.prompt.trim();
  if (brief.allowPromptPreprocess) {
    // Callers that opt into legacy preprocess must do it before compose.
    return base;
  }
  const lock = styleLockPhrase?.trim();
  if (!lock) return base;
  if (base.toLowerCase().includes(lock.toLowerCase())) return base;
  return `${base}, ${lock}`;
}
