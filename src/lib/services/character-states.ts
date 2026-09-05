import fs from "fs";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { Character, CharacterAngle, CharacterState } from "@/lib/db/schema";
import {
  listCharacterPreviewSources,
  resolveCharacterStateCoverPath,
  buildCharacterAngleReferenceDescription,
  type CharacterStatePreview,
} from "@/lib/character-preview";
import { resolveProjectRoot, writeEntityMeta } from "@/lib/paths/project-paths";
import path from "path";
import { nowMs } from "@/lib/utils";
import { buildStateLookContext } from "@/lib/services/character-look-context";

export { buildStateLookContext } from "@/lib/services/character-look-context";

export type CharacterStateWithAngles = CharacterStatePreview;

export function listCharacterAngles(characterStateId: string): CharacterAngle[] {
  const db = getDb();
  return db
    .select()
    .from(schema.characterAngles)
    .where(eq(schema.characterAngles.characterStateId, characterStateId))
    .orderBy(
      asc(schema.characterAngles.sortOrder),
      asc(schema.characterAngles.createdAt)
    )
    .all();
}

export function listCharacterStates(
  characterId: string
): CharacterStateWithAngles[] {
  const db = getDb();
  const states = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.characterId, characterId))
    .orderBy(
      asc(schema.characterStates.sortOrder),
      asc(schema.characterStates.createdAt)
    )
    .all();

  return states.map((state) => ({
    ...state,
    angles: listCharacterAngles(state.id),
  }));
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

export function getCharacterAngle(
  projectId: string,
  characterId: string,
  stateId: string,
  angleId: string
): CharacterAngle | null {
  const state = getCharacterState(projectId, characterId, stateId);
  if (!state) return null;

  const db = getDb();
  const angle = db
    .select()
    .from(schema.characterAngles)
    .where(eq(schema.characterAngles.id, angleId))
    .get();
  if (!angle || angle.characterStateId !== stateId) return null;
  return angle;
}

export function createCharacterState(input: {
  projectId: string;
  characterId: string;
  name: string;
  lookDescription?: string;
  timelineNote?: string;
}): CharacterStateWithAngles {
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
  const stateId = nanoid();
  const row: typeof schema.characterStates.$inferInsert = {
    id: stateId,
    characterId: input.characterId,
    name: input.name.trim(),
    lookDescription: input.lookDescription?.trim() ?? "",
    timelineNote: input.timelineNote?.trim() ?? "",
    sortOrder: existing.length,
    createdAt: ts,
    updatedAt: ts,
  };

  db.insert(schema.characterStates).values(row).run();

  const angle = createCharacterAngle({
    projectId: input.projectId,
    characterId: input.characterId,
    stateId,
    name: "Front full body",
    viewDescription:
      "Full body front three-quarter, head to toe, casting reference framing",
  });

  const state = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .get()!;

  return { ...state, angles: [angle] };
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

export function createCharacterAngle(input: {
  projectId: string;
  characterId: string;
  stateId: string;
  name: string;
  viewDescription?: string;
}): CharacterAngle {
  const state = getCharacterState(input.projectId, input.characterId, input.stateId);
  if (!state) throw new Error("Character state not found");

  const existing = listCharacterAngles(input.stateId);
  const ts = nowMs();
  const id = nanoid();
  const row: typeof schema.characterAngles.$inferInsert = {
    id,
    characterStateId: input.stateId,
    name: input.name.trim(),
    viewDescription: input.viewDescription?.trim() ?? "",
    sortOrder: existing.length,
    createdAt: ts,
    updatedAt: ts,
  };

  const db = getDb();
  db.insert(schema.characterAngles).values(row).run();
  return db
    .select()
    .from(schema.characterAngles)
    .where(eq(schema.characterAngles.id, id))
    .get()!;
}

export function updateCharacterAngle(
  projectId: string,
  characterId: string,
  stateId: string,
  angleId: string,
  patch: Partial<{ name: string; viewDescription: string; sortOrder: number }>
): CharacterAngle {
  const existing = getCharacterAngle(
    projectId,
    characterId,
    stateId,
    angleId
  );
  if (!existing) throw new Error("Character angle not found");

  const db = getDb();
  const updates: Partial<typeof schema.characterAngles.$inferInsert> = {
    updatedAt: nowMs(),
  };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.viewDescription !== undefined) {
    updates.viewDescription = patch.viewDescription;
  }
  if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder;

  db.update(schema.characterAngles)
    .set(updates)
    .where(eq(schema.characterAngles.id, angleId))
    .run();

  return db
    .select()
    .from(schema.characterAngles)
    .where(eq(schema.characterAngles.id, angleId))
    .get()!;
}

export function deleteCharacterAngle(
  projectId: string,
  characterId: string,
  stateId: string,
  angleId: string
): void {
  const existing = getCharacterAngle(
    projectId,
    characterId,
    stateId,
    angleId
  );
  if (!existing) throw new Error("Character angle not found");

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);

  db.delete(schema.assetGenerationBatches)
    .where(
      and(
        eq(schema.assetGenerationBatches.entityType, "character_angle"),
        eq(schema.assetGenerationBatches.entityId, angleId)
      )
    )
    .run();

  const angleDir = path.join(
    projectRoot,
    "characters",
    characterId,
    "states",
    stateId,
    "angles",
    angleId
  );
  if (fs.existsSync(angleDir)) {
    fs.rmSync(angleDir, { recursive: true, force: true });
  }

  db.delete(schema.characterAngles)
    .where(eq(schema.characterAngles.id, angleId))
    .run();

  const stateWithAngles = listCharacterStates(characterId).find(
    (item) => item.id === stateId
  );
  if (stateWithAngles) {
    syncCharacterReferenceFromState(characterId, stateWithAngles, projectRoot);
  }
}

export {
  listCharacterPreviewSources,
  listCharacterAnglePreviewSources,
  resolveCharacterStateCoverPath,
  buildCharacterAngleReferenceDescription,
  resolveCharacterAnchorReferencePath,
  resolveCharacterAnchorAngleName,
} from "@/lib/character-preview";

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
  state: CharacterState | CharacterStateWithAngles,
  projectRoot: string
): void {
  const stateWithAngles: CharacterStateWithAngles =
    "angles" in state && Array.isArray(state.angles)
      ? state
      : { ...state, angles: listCharacterAngles(state.id) };
  const coverPath =
    resolveCharacterStateCoverPath(stateWithAngles) ??
    stateWithAngles.referencePath ??
    null;
  const coverAngle =
    stateWithAngles.angles.find((angle) => angle.referencePath === coverPath) ??
    stateWithAngles.angles[0];
  const referenceKind =
    coverAngle?.referenceKind ?? stateWithAngles.referenceKind ?? null;
  const referenceSource =
    coverAngle?.referenceSource ?? stateWithAngles.referenceSource ?? null;

  const db = getDb();
  const ts = nowMs();
  if (coverPath && coverPath !== stateWithAngles.referencePath) {
    db.update(schema.characterStates)
      .set({
        referencePath: coverPath,
        referenceKind,
        referenceSource,
        updatedAt: ts,
      })
      .where(eq(schema.characterStates.id, stateWithAngles.id))
      .run();
  }
  db.update(schema.characters)
    .set({
      referencePath: coverPath,
      referenceKind,
      referenceSource,
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
    referencePath: coverPath,
    referenceKind,
    referenceSource,
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
