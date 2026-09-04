import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Shot } from "@/lib/db/schema";
import { listLocationStates } from "@/lib/services/location-states";
import {
  getShotCharacterCast,
  resolveCharacterStateForCast,
} from "@/lib/services/character-states";
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

export function resolveShotReferencePathForBatch(batch: {
  entityType: string;
  entityId: string;
}): string | null {
  if (batch.entityType !== "shot") return null;
  return resolveShotReferencePath(batch.entityId);
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
