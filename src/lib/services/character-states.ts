import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { Character, CharacterState } from "@/lib/db/schema";
import { writeEntityMeta } from "@/lib/paths/project-paths";
import path from "path";
import { nowMs } from "@/lib/utils";
import { buildStateLookContext } from "@/lib/services/character-look-context";

export { buildStateLookContext } from "@/lib/services/character-look-context";

export function listCharacterStates(characterId: string): CharacterState[] {
  const db = getDb();
  return db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.characterId, characterId))
    .orderBy(
      asc(schema.characterStates.sortOrder),
      asc(schema.characterStates.createdAt)
    )
    .all();
}

export function getCharacterState(
  projectId: string,
  characterId: string,
  stateId: string
): CharacterState | null {
  const db = getDb();
  const state = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .get();
  if (!state || state.characterId !== characterId) return null;

  const character = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId))
    .get();
  if (!character || character.projectId !== projectId) return null;

  return state;
}

export function createCharacterState(input: {
  projectId: string;
  characterId: string;
  name: string;
  lookDescription?: string;
  timelineNote?: string;
}): CharacterState {
  const db = getDb();
  const character = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, input.characterId))
    .get();
  if (!character || character.projectId !== input.projectId) {
    throw new Error("Character not found");
  }

  const existing = listCharacterStates(input.characterId);
  const ts = nowMs();
  const id = nanoid();
  const row: typeof schema.characterStates.$inferInsert = {
    id,
    characterId: input.characterId,
    name: input.name.trim(),
    lookDescription: input.lookDescription?.trim() ?? "",
    timelineNote: input.timelineNote?.trim() ?? "",
    sortOrder: existing.length,
    createdAt: ts,
    updatedAt: ts,
  };

  db.insert(schema.characterStates).values(row).run();
  return db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, id))
    .get()!;
}

export function updateCharacterState(
  projectId: string,
  characterId: string,
  stateId: string,
  patch: Partial<{
    name: string;
    lookDescription: string;
    timelineNote: string;
    sortOrder: number;
  }>
): CharacterState {
  const existing = getCharacterState(projectId, characterId, stateId);
  if (!existing) throw new Error("Character state not found");

  const db = getDb();
  const updates: Partial<typeof schema.characterStates.$inferInsert> = {
    updatedAt: nowMs(),
  };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.lookDescription !== undefined) {
    updates.lookDescription = patch.lookDescription;
  }
  if (patch.timelineNote !== undefined) {
    updates.timelineNote = patch.timelineNote;
  }
  if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder;

  db.update(schema.characterStates)
    .set(updates)
    .where(eq(schema.characterStates.id, stateId))
    .run();

  return db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .get()!;
}

export function deleteCharacterState(
  projectId: string,
  characterId: string,
  stateId: string
): void {
  const existing = getCharacterState(projectId, characterId, stateId);
  if (!existing) throw new Error("Character state not found");

  const db = getDb();
  db.delete(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .run();
}

export function buildStateSheetDescription(
  character: Character,
  state: CharacterState
): string {
  const identity = character.description.trim();
  const look = state.lookDescription.trim();
  if (identity && look) return `${identity}. ${look}`;
  return look || identity;
}

export function syncCharacterReferenceFromState(
  characterId: string,
  state: CharacterState,
  projectRoot: string
): void {
  const db = getDb();
  const ts = nowMs();
  db.update(schema.characters)
    .set({
      referencePath: state.referencePath,
      referenceKind: state.referenceKind,
      referenceSource: state.referenceSource,
      updatedAt: ts,
    })
    .where(eq(schema.characters.id, characterId))
    .run();

  const character = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId))
    .get();
  if (!character) return;

  writeEntityMeta(path.join(projectRoot, "characters", characterId), {
    id: character.id,
    name: character.name,
    description: character.description,
    referencePath: state.referencePath,
    referenceKind: state.referenceKind,
    referenceSource: state.referenceSource,
    updatedAt: ts,
  });
}

export function resolveCharacterStateForCast(
  characterId: string,
  characterStateId: string | null | undefined
): CharacterState | null {
  const db = getDb();
  if (characterStateId) {
    const state = db
      .select()
      .from(schema.characterStates)
      .where(eq(schema.characterStates.id, characterStateId))
      .get();
    if (state?.characterId === characterId) return state;
  }

  return (
    db
      .select()
      .from(schema.characterStates)
      .where(eq(schema.characterStates.characterId, characterId))
      .orderBy(
        asc(schema.characterStates.sortOrder),
        asc(schema.characterStates.createdAt)
      )
      .get() ?? null
  );
}

export function getShotCharacterCast(shotId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.shotCharacters)
    .where(eq(schema.shotCharacters.shotId, shotId))
    .all();
}

export function buildShotCharacterLookSuffix(shotId: string): string {
  const db = getDb();
  const cast = getShotCharacterCast(shotId);
  const parts: string[] = [];

  for (const row of cast) {
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
    if (!state) continue;
    parts.push(buildStateLookContext(character, state));
  }

  return parts.join("; ");
}
