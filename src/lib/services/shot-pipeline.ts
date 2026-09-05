import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  getShotCharacterCast,
  resolveCharacterStateForCast,
} from "@/lib/services/character-states";
import {
  CHARACTER_ISOLATE_PROMPT_SUFFIX,
  extractIsolatePoseKeywords,
} from "@/lib/shot-pipeline-shared";

export {
  CHARACTER_ISOLATE_PROMPT_SUFFIX,
  CHARACTER_ISOLATE_NEGATIVE,
  extractIsolatePoseKeywords,
  stripLocationFromShotAction,
  buildCharacterIsolateNegative,
  resolveAssetOptionTemplateId,
  getPipelineIsolateOutputPath,
  filterSelectableShotOptions,
  pipelineStageStatusLabel,
} from "@/lib/shot-pipeline-shared";

export function buildCharacterIsolatePrompt(
  shotId: string,
  shotActionPrompt: string
): string {
  const db = getDb();
  const castParts: string[] = [];

  for (const row of getShotCharacterCast(shotId)) {
    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, row.characterId))
      .get();
    if (!character) continue;
    const state = resolveCharacterStateForCast(
      row.characterId,
      row.characterStateId
    );
    castParts.push(character.description.trim());
    if (state?.lookDescription?.trim()) {
      castParts.push(state.lookDescription.trim());
    }
  }

  const pose = extractIsolatePoseKeywords(shotActionPrompt);
  const subject = castParts.length ? castParts.join(", ") : "person";
  return `${subject}, ${pose}. ${CHARACTER_ISOLATE_PROMPT_SUFFIX}`;
}

/**
 * Face detail pass prompt: describe only the character so the FaceDetailer
 * crop is guided by identity, not scene composition language.
 */
export function buildFaceRefinePrompt(shotId: string): string {
  const db = getDb();
  const castParts: string[] = [];

  for (const row of getShotCharacterCast(shotId)) {
    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, row.characterId))
      .get();
    if (!character) continue;
    const state = resolveCharacterStateForCast(
      row.characterId,
      row.characterStateId
    );
    castParts.push(character.description.trim());
    if (state?.lookDescription?.trim()) {
      castParts.push(state.lookDescription.trim());
    }
  }

  const subject = castParts.length ? castParts.join(", ") : "person";
  return `photo of ${subject}, detailed face, sharp eyes, natural skin texture, photorealistic`;
}
