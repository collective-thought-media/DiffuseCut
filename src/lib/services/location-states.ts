import fs from "fs";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { LocationAngle, LocationState } from "@/lib/db/schema";
import {
  listLocationPreviewSources,
  resolveLocationStateCoverPath,
  buildAngleReferenceDescription,
  type LocationStatePreview,
} from "@/lib/location-preview";
import { resolveProjectRoot, writeEntityMeta } from "@/lib/paths/project-paths";
import path from "path";
import { nowMs } from "@/lib/utils";

export type LocationStateWithAngles = LocationStatePreview;

export function listLocationAngles(locationStateId: string): LocationAngle[] {
  const db = getDb();
  return db
    .select()
    .from(schema.locationAngles)
    .where(eq(schema.locationAngles.locationStateId, locationStateId))
    .orderBy(
      asc(schema.locationAngles.sortOrder),
      asc(schema.locationAngles.createdAt)
    )
    .all();
}

export function listLocationStates(locationId: string): LocationStateWithAngles[] {
  const db = getDb();
  const states = db
    .select()
    .from(schema.locationStates)
    .where(eq(schema.locationStates.locationId, locationId))
    .orderBy(
      asc(schema.locationStates.sortOrder),
      asc(schema.locationStates.createdAt)
    )
    .all();

  return states.map((state) => ({
    ...state,
    angles: listLocationAngles(state.id),
  }));
}

export function getLocationState(
  projectId: string,
  locationId: string,
  stateId: string
): LocationState | null {
  const db = getDb();
  const state = db
    .select()
    .from(schema.locationStates)
    .where(eq(schema.locationStates.id, stateId))
    .get();
  if (!state || state.locationId !== locationId) return null;

  const location = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId))
    .get();
  if (!location || location.projectId !== projectId) return null;

  return state;
}

export function getLocationAngle(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string
): LocationAngle | null {
  const state = getLocationState(projectId, locationId, stateId);
  if (!state) return null;

  const db = getDb();
  const angle = db
    .select()
    .from(schema.locationAngles)
    .where(eq(schema.locationAngles.id, angleId))
    .get();
  if (!angle || angle.locationStateId !== stateId) return null;
  return angle;
}

export function createLocationState(input: {
  projectId: string;
  locationId: string;
  name: string;
  lookDescription?: string;
  timelineNote?: string;
}): LocationStateWithAngles {
  const db = getDb();
  const location = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, input.locationId))
    .get();
  if (!location || location.projectId !== input.projectId) {
    throw new Error("Location not found");
  }

  const existing = listLocationStates(input.locationId);
  const ts = nowMs();
  const stateId = nanoid();
  const row: typeof schema.locationStates.$inferInsert = {
    id: stateId,
    locationId: input.locationId,
    name: input.name.trim(),
    lookDescription: input.lookDescription?.trim() ?? "",
    timelineNote: input.timelineNote?.trim() ?? "",
    sortOrder: existing.length,
    createdAt: ts,
    updatedAt: ts,
  };

  db.insert(schema.locationStates).values(row).run();

  const angle = createLocationAngle({
    projectId: input.projectId,
    locationId: input.locationId,
    stateId,
    name: "Establishing wide",
    viewDescription: "Wide establishing view of the full environment",
  });

  const state = db
    .select()
    .from(schema.locationStates)
    .where(eq(schema.locationStates.id, stateId))
    .get()!;

  return { ...state, angles: [angle] };
}

export function createDefaultLocationStateAndAngle(input: {
  projectId: string;
  locationId: string;
  description?: string;
}): LocationStateWithAngles {
  return createLocationState({
    projectId: input.projectId,
    locationId: input.locationId,
    name: "Default look",
    lookDescription: input.description ?? "",
  });
}

export function updateLocationState(
  projectId: string,
  locationId: string,
  stateId: string,
  patch: Partial<{
    name: string;
    lookDescription: string;
    timelineNote: string;
    sortOrder: number;
  }>
): LocationState {
  const existing = getLocationState(projectId, locationId, stateId);
  if (!existing) throw new Error("Location state not found");

  const db = getDb();
  const updates: Partial<typeof schema.locationStates.$inferInsert> = {
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

  db.update(schema.locationStates)
    .set(updates)
    .where(eq(schema.locationStates.id, stateId))
    .run();

  return db
    .select()
    .from(schema.locationStates)
    .where(eq(schema.locationStates.id, stateId))
    .get()!;
}

export function deleteLocationState(
  projectId: string,
  locationId: string,
  stateId: string
): void {
  const existing = getLocationState(projectId, locationId, stateId);
  if (!existing) throw new Error("Location state not found");

  const db = getDb();
  db.delete(schema.locationStates)
    .where(eq(schema.locationStates.id, stateId))
    .run();
}

export function createLocationAngle(input: {
  projectId: string;
  locationId: string;
  stateId: string;
  name: string;
  viewDescription?: string;
}): LocationAngle {
  const state = getLocationState(input.projectId, input.locationId, input.stateId);
  if (!state) throw new Error("Location state not found");

  const existing = listLocationAngles(input.stateId);
  const ts = nowMs();
  const id = nanoid();
  const row: typeof schema.locationAngles.$inferInsert = {
    id,
    locationStateId: input.stateId,
    name: input.name.trim(),
    viewDescription: input.viewDescription?.trim() ?? "",
    sortOrder: existing.length,
    createdAt: ts,
    updatedAt: ts,
  };

  const db = getDb();
  db.insert(schema.locationAngles).values(row).run();
  return db
    .select()
    .from(schema.locationAngles)
    .where(eq(schema.locationAngles.id, id))
    .get()!;
}

export function updateLocationAngle(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string,
  patch: Partial<{ name: string; viewDescription: string; sortOrder: number }>
): LocationAngle {
  const existing = getLocationAngle(
    projectId,
    locationId,
    stateId,
    angleId
  );
  if (!existing) throw new Error("Location angle not found");

  const db = getDb();
  const updates: Partial<typeof schema.locationAngles.$inferInsert> = {
    updatedAt: nowMs(),
  };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.viewDescription !== undefined) {
    updates.viewDescription = patch.viewDescription;
  }
  if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder;

  db.update(schema.locationAngles)
    .set(updates)
    .where(eq(schema.locationAngles.id, angleId))
    .run();

  return db
    .select()
    .from(schema.locationAngles)
    .where(eq(schema.locationAngles.id, angleId))
    .get()!;
}

export function deleteLocationAngle(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string
): void {
  const existing = getLocationAngle(
    projectId,
    locationId,
    stateId,
    angleId
  );
  if (!existing) throw new Error("Location angle not found");

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
        eq(schema.assetGenerationBatches.entityType, "location_angle"),
        eq(schema.assetGenerationBatches.entityId, angleId)
      )
    )
    .run();

  const angleDir = path.join(
    projectRoot,
    "locations",
    locationId,
    "states",
    stateId,
    "angles",
    angleId
  );
  if (fs.existsSync(angleDir)) {
    fs.rmSync(angleDir, { recursive: true, force: true });
  }

  db.delete(schema.locationAngles)
    .where(eq(schema.locationAngles.id, angleId))
    .run();

  const stateWithAngles = listLocationStates(locationId).find(
    (item) => item.id === stateId
  );
  if (stateWithAngles) {
    syncLocationReferenceFromState(locationId, stateWithAngles, projectRoot);
  }
}

export {
  listLocationPreviewSources,
  listLocationAnglePreviewSources,
  countLocationThumbnailVariants,
  resolveLocationStateCoverPath,
  buildAngleReferenceDescription,
  resolveLocationAnchorReferencePath,
  resolveLocationAnchorAngleName,
} from "@/lib/location-preview";

export function syncLocationReferenceFromState(
  locationId: string,
  state: LocationStateWithAngles,
  projectRoot: string
): void {
  const coverPath =
    resolveLocationStateCoverPath(state) ?? state.referencePath ?? null;
  const coverAngle =
    state.angles.find((angle) => angle.referencePath === coverPath) ??
    state.angles[0];
  const referenceKind = coverAngle?.referenceKind ?? state.referenceKind ?? null;
  const referenceSource =
    coverAngle?.referenceSource ?? state.referenceSource ?? null;

  const db = getDb();
  const ts = nowMs();
  db.update(schema.locations)
    .set({
      referencePath: coverPath,
      referenceKind,
      referenceSource,
      updatedAt: ts,
    })
    .where(eq(schema.locations.id, locationId))
    .run();

  const location = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId))
    .get();
  if (!location) return;

  writeEntityMeta(path.join(projectRoot, "locations", locationId), {
    id: location.id,
    name: location.name,
    description: location.description,
    referencePath: coverPath,
    referenceKind,
    referenceSource,
    updatedAt: ts,
  });
}
