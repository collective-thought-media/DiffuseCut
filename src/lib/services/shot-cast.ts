import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { listCharacterStates } from "@/lib/services/character-states";

export interface ShotCharacterCastEntry {
  characterId: string;
  characterStateId: string | null;
}

export function getShotCharacterCast(shotId: string): ShotCharacterCastEntry[] {
  const db = getDb();
  return db
    .select()
    .from(schema.shotCharacters)
    .where(eq(schema.shotCharacters.shotId, shotId))
    .all()
    .map((row) => ({
      characterId: row.characterId,
      characterStateId: row.characterStateId ?? null,
    }));
}

export function syncShotCharacterCast(
  shotId: string,
  projectId: string,
  cast: ShotCharacterCastEntry[]
) {
  const db = getDb();

  for (const entry of cast) {
    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, entry.characterId))
      .get();
    if (!character || character.projectId !== projectId) {
      throw new Error(`Character not found: ${entry.characterId}`);
    }

    if (entry.characterStateId) {
      const state = db
        .select()
        .from(schema.characterStates)
        .where(eq(schema.characterStates.id, entry.characterStateId))
        .get();
      if (!state || state.characterId !== entry.characterId) {
        throw new Error(`Character state not found: ${entry.characterStateId}`);
      }
    }
  }

  db.delete(schema.shotCharacters)
    .where(eq(schema.shotCharacters.shotId, shotId))
    .run();

  for (const entry of cast) {
    let characterStateId = entry.characterStateId;
    if (!characterStateId) {
      const defaultState = listCharacterStates(entry.characterId)[0];
      characterStateId = defaultState?.id ?? null;
    }

    db.insert(schema.shotCharacters)
      .values({
        shotId,
        characterId: entry.characterId,
        characterStateId,
      })
      .run();
  }
}

export function normalizeLegacyCharacterIds(
  projectId: string,
  characterIds: string[]
): ShotCharacterCastEntry[] {
  return characterIds.map((characterId) => {
    const db = getDb();
    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, characterId))
      .get();
    if (!character || character.projectId !== projectId) {
      throw new Error(`Character not found: ${characterId}`);
    }
    const defaultState = listCharacterStates(characterId)[0];
    return {
      characterId,
      characterStateId: defaultState?.id ?? null,
    };
  });
}
