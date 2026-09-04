import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { detectVirtualBackdropLocation } from "@/lib/location-backdrop";
import { buildAngleReferenceDescription } from "@/lib/location-preview";
import { listLocationStates } from "@/lib/services/location-states";
import {
  buildShotCharacterLookSuffix,
  getShotCharacterCast,
  resolveCharacterStateForCast,
} from "@/lib/services/character-states";
import { buildShotPlaceholderDescriptionFromData, buildShotPlaceholderContextFromData } from "@/lib/services/shot-placeholder-description";
export {
  buildShotPlaceholderDescriptionFromData,
  buildShotPlaceholderContextFromData,
} from "@/lib/services/shot-placeholder-description";

export function buildShotPlaceholderDescription(shotId: string): string {
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotId))
    .get();
  if (!shot) return "";

  let location = null;
  let locationDetail: string | null = null;
  if (shot.locationId) {
    location =
      db
        .select()
        .from(schema.locations)
        .where(eq(schema.locations.id, shot.locationId))
        .get() ?? null;

    const states = listLocationStates(shot.locationId);
    const state =
      states.find((item) => item.id === shot.locationStateId) ?? states[0];
    if (state) {
      const angle =
        state.angles.find((item) => item.id === shot.locationAngleId) ??
        state.angles[0];
      if (angle) {
        locationDetail = buildAngleReferenceDescription(
          location?.description ?? "",
          state,
          angle
        );
      } else {
        locationDetail = [location?.description, state.lookDescription]
          .filter(Boolean)
          .join(". ");
      }
    }
  }

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

  const fromData = buildShotPlaceholderDescriptionFromData({
    prompt: shot.prompt,
    location,
    locationDetail,
    cast,
  });

  if (fromData.trim()) return fromData;

  const lookSuffix = buildShotCharacterLookSuffix(shotId);
  return lookSuffix;
}

export function buildShotPlaceholderContext(shotId: string): string {
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotId))
    .get();
  if (!shot) return "";

  let location = null;
  let locationDetail: string | null = null;
  if (shot.locationId) {
    location =
      db
        .select()
        .from(schema.locations)
        .where(eq(schema.locations.id, shot.locationId))
        .get() ?? null;

    const states = listLocationStates(shot.locationId);
    const state =
      states.find((item) => item.id === shot.locationStateId) ?? states[0];
    if (state) {
      const angle =
        state.angles.find((item) => item.id === shot.locationAngleId) ??
        state.angles[0];
      if (angle) {
        locationDetail = buildAngleReferenceDescription(
          location?.description ?? "",
          state,
          angle
        );
      } else {
        locationDetail = [location?.description, state.lookDescription]
          .filter(Boolean)
          .join(". ");
      }
    }
  }

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

  return buildShotPlaceholderContextFromData({
    prompt: shot.prompt,
    location,
    locationDetail,
    cast,
  });
}

export function resolveShotVirtualBackdrop(shotId: string): boolean {
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotId))
    .get();
  if (!shot) return false;

  const parts: string[] = [shot.title, shot.prompt];
  if (!shot.locationId) {
    return detectVirtualBackdropLocation(...parts);
  }

  const location =
    db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.id, shot.locationId))
      .get() ?? null;
  if (location) {
    parts.push(location.name, location.description);
  }

  const states = listLocationStates(shot.locationId);
  const state =
    states.find((item) => item.id === shot.locationStateId) ?? states[0];
  if (state) {
    parts.push(state.name, state.lookDescription);
    const angle =
      state.angles.find((item) => item.id === shot.locationAngleId) ??
      state.angles[0];
    if (angle) {
      parts.push(angle.name, angle.viewDescription);
      if (location) {
        parts.push(
          buildAngleReferenceDescription(
            location.description ?? "",
            state,
            angle
          )
        );
      }
    }
  }

  return detectVirtualBackdropLocation(...parts);
}
