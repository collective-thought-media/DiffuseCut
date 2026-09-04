import type { Shot, Character, CharacterState } from "@/lib/db/schema";
import type { LocationStatePreview } from "@/lib/location-preview";
import { resolveLocationStateCoverPath } from "@/lib/location-preview";

export type ShotVisualReferenceFocus = "location" | "character";

export type ShotReferencePaths = {
  locationPath: string | null;
  locationStateName: string | null;
  locationAngleName: string | null;
  characterPath: string | null;
  characterName: string | null;
  primaryPath: string | null;
  primaryLabel: string | null;
  focus: ShotVisualReferenceFocus;
};

function isUsableImagePath(
  relativePath: string | null | undefined,
  kind: string | null | undefined
): relativePath is string {
  return Boolean(relativePath && kind !== "video");
}

export function resolveShotLocationReferenceFromStates(
  shot: Pick<Shot, "locationStateId" | "locationAngleId">,
  states: LocationStatePreview[],
  legacyLocationPath?: string | null,
  legacyLocationKind?: string | null
): {
  path: string | null;
  stateName: string | null;
  angleName: string | null;
} {
  if (states.length === 0) {
    if (isUsableImagePath(legacyLocationPath, legacyLocationKind)) {
      return {
        path: legacyLocationPath,
        stateName: null,
        angleName: "Location reference",
      };
    }
    return { path: null, stateName: null, angleName: null };
  }

  const state =
    states.find((item) => item.id === shot.locationStateId) ?? states[0];
  const angle =
    state.angles.find((item) => item.id === shot.locationAngleId) ??
    state.angles.find(
      (item) =>
        isUsableImagePath(item.referencePath, item.referenceKind) &&
        item.name.trim().toLowerCase().includes("establishing")
    ) ??
    state.angles.find((item) =>
      isUsableImagePath(item.referencePath, item.referenceKind)
    ) ??
    state.angles[0];

  if (isUsableImagePath(angle?.referencePath, angle?.referenceKind)) {
    return {
      path: angle.referencePath,
      stateName: state.name,
      angleName: angle.name,
    };
  }

  const stateCover = resolveLocationStateCoverPath(state);
  if (isUsableImagePath(stateCover, "image")) {
    return {
      path: stateCover,
      stateName: state.name,
      angleName: angle?.name ?? null,
    };
  }

  if (isUsableImagePath(state.referencePath, state.referenceKind)) {
    return {
      path: state.referencePath,
      stateName: state.name,
      angleName: angle?.name ?? null,
    };
  }

  if (isUsableImagePath(legacyLocationPath, legacyLocationKind)) {
    return {
      path: legacyLocationPath,
      stateName: state.name,
      angleName: angle?.name ?? null,
    };
  }

  return { path: null, stateName: state.name, angleName: angle?.name ?? null };
}

export function resolveShotCharacterReferenceFromCast(
  cast: Array<{ character: Character; state: CharacterState }>
): { path: string | null; name: string | null } {
  const split = resolveShotCastReferenceSplit(cast);
  if (!split.ipAdapterEntry) {
    return { path: null, name: null };
  }
  return {
    path: split.ipAdapterEntry.path,
    name: split.ipAdapterEntry.character.name,
  };
}

/** Which cast members get IP-Adapter art vs prompt text only (one image slot). */
export function resolveShotCastReferenceSplit(
  cast: Array<{ character: Character; state: CharacterState }>
): {
  ipAdapterEntry: {
    character: Character;
    state: CharacterState;
    path: string;
  } | null;
  promptOnlyEntries: Array<{ character: Character; state: CharacterState }>;
} {
  let ipAdapterEntry: {
    character: Character;
    state: CharacterState;
    path: string;
  } | null = null;
  const promptOnlyEntries: Array<{ character: Character; state: CharacterState }> =
    [];

  for (const entry of cast) {
    const referencePath = entry.state.referencePath ?? entry.character.referencePath;
    const referenceKind = entry.state.referenceKind ?? entry.character.referenceKind;
    if (
      !ipAdapterEntry &&
      isUsableImagePath(referencePath, referenceKind)
    ) {
      ipAdapterEntry = { ...entry, path: referencePath };
      continue;
    }
    promptOnlyEntries.push(entry);
  }

  return { ipAdapterEntry, promptOnlyEntries };
}

export function resolveShotReferencePathsFromData(input: {
  shot: Pick<Shot, "locationStateId" | "locationAngleId">;
  locationStates?: LocationStatePreview[];
  legacyLocationPath?: string | null;
  legacyLocationKind?: string | null;
  cast?: Array<{ character: Character; state: CharacterState }>;
}): ShotReferencePaths {
  const location = resolveShotLocationReferenceFromStates(
    input.shot,
    input.locationStates ?? [],
    input.legacyLocationPath,
    input.legacyLocationKind
  );
  const character = resolveShotCharacterReferenceFromCast(input.cast ?? []);

  const hasCharacter = Boolean(character.path);
  const hasLocation = Boolean(location.path);
  const focus: ShotVisualReferenceFocus = hasCharacter && !hasLocation
    ? "character"
    : "location";

  const primaryPath = location.path ?? character.path;
  let primaryLabel: string | null = null;
  if (hasCharacter && hasLocation) {
    primaryLabel = `${character.name ?? "Character"} + ${[location.stateName, location.angleName].filter(Boolean).join(", ") || "location"}`;
  } else if (hasLocation) {
    primaryLabel = [location.stateName, location.angleName]
      .filter(Boolean)
      .join(", ");
  } else if (hasCharacter) {
    primaryLabel = character.name;
  }

  return {
    locationPath: location.path,
    locationStateName: location.stateName,
    locationAngleName: location.angleName,
    characterPath: character.path,
    characterName: character.name,
    primaryPath,
    primaryLabel,
    focus,
  };
}
