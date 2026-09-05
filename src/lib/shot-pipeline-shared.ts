import type {
  AssetGenerationBatch,
  AssetGenerationOption,
} from "@/lib/db/schema";
import {
  BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID,
  BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

export const CHARACTER_ISOLATE_PROMPT_SUFFIX =
  "single person centered, full body head to toe, subject fills most of the frame height, casting reference photo framing, solid flat light gray seamless studio backdrop only, empty cyclorama, no wall texture, no stone, no props, no floor detail, studio lighting, isolated subject, no environment, no location, no architecture";

export const CHARACTER_ISOLATE_NEGATIVE =
  "street, sidewalk, pavement, building, storefront, shop window, awning, deli, restaurant, city, urban, outdoor, sky, clouds, landscape, scenery, location, set dressing, bokeh background, window, interior, room, wall texture, brick, stone wall, tan wall, beige wall, plaster wall, leaning against wall, plants, planters, trees, cars, traffic, natural daylight, photoreal environment, warm glow, textured background";

/** Keep pose and framing words only for the isolate stage. */
export function extractIsolatePoseKeywords(shotPrompt: string): string {
  const lower = shotPrompt.toLowerCase();
  const parts: string[] = [];

  if (/\bmedium shot\b/.test(lower)) parts.push("medium shot");
  if (/\bfull body\b|\bhead to toe\b/.test(lower)) {
    parts.push("full body head to toe");
  }
  if (/\bfrom behind\b|\brear view\b/.test(lower)) {
    parts.push("from behind, back to camera");
  } else if (/\bfacing camera\b|\bfacing the camera\b/.test(lower)) {
    parts.push("facing camera");
  }
  if (/\bsubject large\b|\blarge in (the )?frame\b/.test(lower)) {
    parts.push("subject large in frame");
  }
  if (/\beye level\b/.test(lower)) parts.push("eye level");
  if (/\bwaist up\b|\bhalf body\b/.test(lower)) parts.push("waist up");

  return parts.length ? parts.join(", ") : "standing, facing camera, neutral pose";
}

/** @deprecated Use extractIsolatePoseKeywords. */
export function stripLocationFromShotAction(shotPrompt: string): string {
  return extractIsolatePoseKeywords(shotPrompt);
}

export function buildCharacterIsolateNegative(baseNegative: string): string {
  if (baseNegative.includes(CHARACTER_ISOLATE_NEGATIVE.slice(0, 24))) {
    return baseNegative;
  }
  return baseNegative
    ? `${baseNegative}, ${CHARACTER_ISOLATE_NEGATIVE}`
    : CHARACTER_ISOLATE_NEGATIVE;
}

export function resolveAssetOptionTemplateId(
  batch: AssetGenerationBatch,
  option: AssetGenerationOption
): string {
  if (option.pipelineStage === "character") {
    return BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID;
  }
  if (option.pipelineStage === "composite") {
    return BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID;
  }
  if (option.pipelineStage === "face_refine") {
    return BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID;
  }
  return batch.workflowTemplateId;
}

export function getPipelineIsolateOutputPath(
  batch: AssetGenerationBatch,
  optionId: string
): string {
  return `.diffusecut/scratch/batches/${batch.id}/${optionId}-character.png`;
}

export function filterSelectableShotOptions(
  options: AssetGenerationOption[]
): AssetGenerationOption[] {
  // A stage output is selectable when it is the last link of its chain: base
  // and character stages feed later stages, and a composite output with a
  // face refine chained onto it is superseded by the refined result.
  const refinedSourceIds = new Set(
    options
      .filter((option) => option.pipelineStage === "face_refine")
      .map((option) => option.dependsOnOptionId)
      .filter((id): id is string => Boolean(id))
  );
  return options.filter(
    (option) =>
      (!option.pipelineStage ||
        option.pipelineStage === "composite" ||
        option.pipelineStage === "face_refine") &&
      !refinedSourceIds.has(option.id)
  );
}

export function pipelineStageStatusLabel(
  stage: string | null | undefined
): string | null {
  if (stage === "character") return "Stage 1/2: Character isolate";
  if (stage === "composite") return "Stage 2/2: Paste and integration pass";
  if (stage === "base") return "Base render (face detail pass follows)";
  if (stage === "face_refine") return "Face detail pass";
  return null;
}
