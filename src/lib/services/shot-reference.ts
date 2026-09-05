import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Shot } from "@/lib/db/schema";
import { listLocationStates } from "@/lib/services/location-states";
import {
  getShotCharacterCast,
  listCharacterAngles,
  resolveCharacterStateForCast,
} from "@/lib/services/character-states";
import { resolveCharacterStateCoverPath } from "@/lib/character-preview";
import {
  resolveShotCharacterReferenceFromCast,
  resolveShotLocationReferenceFromStates,
  resolveShotReferencePathsFromData,
  type ShotReferencePaths,
  type ShotVisualReferenceFocus,
} from "@/lib/services/shot-reference-core";

export type { ShotReferencePaths, ShotVisualReferenceFocus };

export function resolveShotLocationReference(
  shot: Pick<Shot, "locationId" | "locationStateId" | "locationAngleId">
) {
  if (!shot.locationId) {
    return { path: null, stateName: null, angleName: null };
  }

  const db = getDb();
  const location = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, shot.locationId))
    .get();
  const states = listLocationStates(shot.locationId);

  return resolveShotLocationReferenceFromStates(
    shot,
    states,
    location?.referencePath,
    location?.referenceKind
  );
}

export function resolveShotCharacterReference(shotId: string) {
  const db = getDb();
  const cast = getShotCharacterCast(shotId).flatMap((row) => {
    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, row.characterId))
      .get();
    if (!character) return [];
    const state = resolveCharacterStateForCast(
      row.characterId,
      row.characterStateId
    );
    if (!state) return [];
    return [{ character, state }];
  });

  return resolveShotCharacterReferenceFromCast(cast);
}

export function resolveShotReferencePaths(shot: Shot): ShotReferencePaths {
  const db = getDb();
  let legacyLocationPath: string | null = null;
  let legacyLocationKind: string | null = null;
  let locationStates = undefined as ReturnType<typeof listLocationStates> | undefined;

  if (shot.locationId) {
    const location = db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.id, shot.locationId))
      .get();
    legacyLocationPath = location?.referencePath ?? null;
    legacyLocationKind = location?.referenceKind ?? null;
    locationStates = listLocationStates(shot.locationId);
  }

  const cast = getShotCharacterCast(shot.id).flatMap((row) => {
    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, row.characterId))
      .get();
    if (!character) return [];
    const state = resolveCharacterStateForCast(
      row.characterId,
      row.characterStateId
    );
    if (!state) return [];
    return [{ character, state }];
  });

  return resolveShotReferencePathsFromData({
    shot,
    locationStates,
    legacyLocationPath,
    legacyLocationKind,
    cast,
  });
}

export function resolveShotReferencePath(shotId: string): string | null {
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotId))
    .get();
  if (!shot) return null;
  return resolveShotReferencePaths(shot).primaryPath;
}

/**
 * Canonical face reference for a shot's face detail pass: the first (default)
 * state of the shot's cast, typically the studio casting portrait, so one
 * face drives likeness across every outfit, state, and scene. Returns null
 * when no cast member has a default-state image; callers fall back to the
 * state-resolved character reference.
 */
export function resolveShotCanonicalFacePathForBatch(batch: {
  entityType: string;
  entityId: string;
}): string | null {
  if (batch.entityType !== "shot") return null;
  const db = getDb();
  for (const row of getShotCharacterCast(batch.entityId)) {
    const defaultState = db
      .select()
      .from(schema.characterStates)
      .where(eq(schema.characterStates.characterId, row.characterId))
      .orderBy(
        asc(schema.characterStates.sortOrder),
        asc(schema.characterStates.createdAt)
      )
      .get();
    if (!defaultState) continue;
    const coverPath = resolveCharacterStateCoverPath({
      ...defaultState,
      angles: listCharacterAngles(defaultState.id),
    });
    if (coverPath) return coverPath;
  }
  return null;
}

export function resolveShotReferencePathForBatch(batch: {
  entityType: string;
  entityId: string;
  generationOptionsJson?: string | null;
}): string | null {
  if (batch.entityType !== "shot") return null;

  const { characterPath, locationPath } =
    resolveShotDualReferencePathsForBatch(batch);

  if (batch.generationOptionsJson) {
    try {
      const options = JSON.parse(
        batch.generationOptionsJson
      ) as { referenceFocus?: "character" | "location"; useIpAdapter?: boolean };
      if (options.useIpAdapter === false) return null;
      if (options.referenceFocus === "character") return characterPath;
      if (options.referenceFocus === "location") return locationPath;
    } catch {
      /* fall through */
    }
  }

  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, batch.entityId))
    .get();
  if (!shot) return null;
  return resolveShotReferencePaths(shot).primaryPath;
}

export function resolveShotDualReferencePathsForBatch(batch: {
  entityType: string;
  entityId: string;
}): { characterPath: string | null; locationPath: string | null } {
  if (batch.entityType !== "shot") {
    return { characterPath: null, locationPath: null };
  }
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, batch.entityId))
    .get();
  if (!shot) {
    return { characterPath: null, locationPath: null };
  }
  const refs = resolveShotReferencePaths(shot);
  return {
    characterPath: refs.characterPath,
    locationPath: refs.locationPath,
  };
}
