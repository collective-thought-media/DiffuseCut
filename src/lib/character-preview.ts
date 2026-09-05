import type { CharacterAngle, CharacterState } from "@/lib/db/schema";

export type CharacterStatePreview = CharacterState & { angles: CharacterAngle[] };

export function resolveCharacterStateCoverPath(
  state: CharacterStatePreview
): string | null {
  const angleRef = state.angles.find(
    (angle) => angle.referencePath && angle.referenceKind !== "video"
  );
  if (angleRef?.referencePath) return angleRef.referencePath;
  if (state.referencePath && state.referenceKind !== "video") {
    return state.referencePath;
  }
  return null;
}

export function listCharacterPreviewSources(
  states: CharacterStatePreview[]
): string[] {
  return states
    .map((state) => resolveCharacterStateCoverPath(state))
    .filter((pathValue): pathValue is string => Boolean(pathValue));
}

/** All angle reference images for character index thumbnails, in state/angle order. */
export function listCharacterAnglePreviewSources(
  states: CharacterStatePreview[]
): string[] {
  const paths: string[] = [];

  for (const state of states) {
    let stateAdded = false;
    for (const angle of state.angles) {
      if (angle.referencePath && angle.referenceKind !== "video") {
        paths.push(angle.referencePath);
        stateAdded = true;
      }
    }
    if (
      !stateAdded &&
      state.referencePath &&
      state.referenceKind !== "video"
    ) {
      paths.push(state.referencePath);
    }
  }

  return paths;
}

export function buildCharacterAngleReferenceDescription(
  characterDescription: string,
  state: CharacterState,
  angle: CharacterAngle
): string {
  const identity = characterDescription.trim();
  const stateLook = state.lookDescription.trim();
  const view = angle.viewDescription.trim();
  return [identity, stateLook, view].filter(Boolean).join(". ");
}

/** Anchored angles: lead with pose/view so composition is not drowned by identity. */
export function buildAnchoredCharacterAngleReferenceDescription(
  characterDescription: string,
  state: CharacterState,
  angle: CharacterAngle
): string {
  const identity = characterDescription.trim();
  const stateLook = state.lookDescription.trim();
  const view = angle.viewDescription.trim();
  return [view, stateLook, identity].filter(Boolean).join(". ");
}

/** Saved reference image to anchor tighter angles within the same character state. */
export function resolveCharacterAnchorReferencePath(
  state: CharacterStatePreview,
  excludeAngleId?: string
): string | null {
  const candidates = state.angles.filter(
    (angle) =>
      angle.id !== excludeAngleId &&
      angle.referencePath &&
      angle.referenceKind !== "video"
  );
  if (candidates.length === 0) return null;

  const front = candidates.find((angle) =>
    angle.name.trim().toLowerCase().includes("front")
  );
  return front?.referencePath ?? candidates[0]?.referencePath ?? null;
}

export function resolveCharacterAnchorAngleName(
  state: CharacterStatePreview,
  excludeAngleId?: string
): string | null {
  const anchorPath = resolveCharacterAnchorReferencePath(state, excludeAngleId);
  if (!anchorPath) return null;
  return (
    state.angles.find((angle) => angle.referencePath === anchorPath)?.name ??
    null
  );
}

/** Front angle in the same state, used to split front/back diptych panels. */
export function resolveCharacterFrontAngleId(
  state: CharacterStatePreview,
  excludeAngleId?: string
): string | null {
  const front = state.angles.find(
    (angle) =>
      angle.id !== excludeAngleId &&
      angle.name.trim().toLowerCase().includes("front")
  );
  return front?.id ?? null;
}

/** Back angle in the same state, paired with front for diptych split. */
export function resolveCharacterBackAngleId(
  state: CharacterStatePreview,
  excludeAngleId?: string
): string | null {
  const back = state.angles.find(
    (angle) =>
      angle.id !== excludeAngleId &&
      angle.name.trim().toLowerCase().includes("back")
  );
  return back?.id ?? null;
}

/** Generate a front+back diptych when enqueueing from the front angle and a back angle exists. */
export function shouldGenerateFrontBackDiptych(
  state: CharacterStatePreview,
  angleId: string
): boolean {
  const frontId = resolveCharacterFrontAngleId(state);
  const backId = resolveCharacterBackAngleId(state);
  return Boolean(frontId && backId && frontId === angleId);
}
