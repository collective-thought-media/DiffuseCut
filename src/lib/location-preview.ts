import type { LocationAngle, LocationState } from "@/lib/db/schema";

export type LocationStatePreview = LocationState & { angles: LocationAngle[] };

export function resolveLocationStateCoverPath(
  state: LocationStatePreview
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

export function listLocationPreviewSources(
  states: LocationStatePreview[]
): string[] {
  return states
    .map((state) => resolveLocationStateCoverPath(state))
    .filter((pathValue): pathValue is string => Boolean(pathValue));
}

/** All angle reference images for location index thumbnails, in state/angle order. */
export function listLocationAnglePreviewSources(
  states: LocationStatePreview[]
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

export function countLocationThumbnailVariants(
  states: LocationStatePreview[]
): number {
  const angleSources = listLocationAnglePreviewSources(states);
  if (angleSources.length > 0) return angleSources.length;
  return states.length;
}

export function buildAngleReferenceDescription(
  locationDescription: string,
  state: LocationState,
  angle: LocationAngle
): string {
  const identity = locationDescription.trim();
  const stateLook = state.lookDescription.trim();
  const view = angle.viewDescription.trim();
  return [identity, stateLook, view].filter(Boolean).join(". ");
}

/** Anchored angles: lead with camera/view so composition is not drowned by location identity. */
export function buildAnchoredAngleReferenceDescription(
  locationDescription: string,
  state: LocationState,
  angle: LocationAngle
): string {
  const identity = locationDescription.trim();
  const stateLook = state.lookDescription.trim();
  const view = angle.viewDescription.trim();
  return [view, stateLook, identity].filter(Boolean).join(". ");
}

/** Saved reference image to anchor tighter angles within the same location state. */
export function resolveLocationAnchorReferencePath(
  state: LocationStatePreview,
  excludeAngleId?: string
): string | null {
  const candidates = state.angles.filter(
    (angle) =>
      angle.id !== excludeAngleId &&
      angle.referencePath &&
      angle.referenceKind !== "video"
  );
  if (candidates.length === 0) return null;

  const establishing = candidates.find((angle) =>
    angle.name.trim().toLowerCase().includes("establishing")
  );
  return (
    establishing?.referencePath ??
    candidates[0]?.referencePath ??
    null
  );
}

export function resolveLocationAnchorAngleName(
  state: LocationStatePreview,
  excludeAngleId?: string
): string | null {
  const anchorPath = resolveLocationAnchorReferencePath(state, excludeAngleId);
  if (!anchorPath) return null;
  return (
    state.angles.find((angle) => angle.referencePath === anchorPath)?.name ??
    null
  );
}
