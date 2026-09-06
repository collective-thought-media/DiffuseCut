import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { CharacterAngle, CharacterState, LocationAngle } from "@/lib/db/schema";
import { resolveProjectRoot } from "@/lib/paths/project-paths";
import {
  getCharacterAngle,
  getCharacterState,
  listCharacterAngles,
  listCharacterStates,
  syncCharacterReferenceFromState,
} from "@/lib/services/character-states";
import {
  getLocationAngle,
  listLocationStates,
  syncLocationReferenceFromState,
} from "@/lib/services/location-states";
import {
  mediaKindFromExtension,
  sanitizeFileName,
} from "@/lib/services/media-import";
import { nowMs } from "@/lib/utils";

export type SheetReferenceMediaSource = "upload" | "url";

function writeReferenceFile(
  projectRoot: string,
  relativeDir: string,
  buffer: Buffer,
  fileName: string
): { relativePath: string; kind: "image" | "video" } {
  const safeName = sanitizeFileName(fileName);
  const kind = mediaKindFromExtension(safeName);
  if (!kind) {
    throw new Error("Reference must be an image or video file");
  }

  const ext = path.extname(safeName) || (kind === "video" ? ".mp4" : ".png");
  const destRelative = `${relativeDir}/reference${ext}`.replace(/\\/g, "/");
  const destAbs = path.join(projectRoot, destRelative);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });

  if (fs.existsSync(destAbs)) {
    fs.unlinkSync(destAbs);
  }

  fs.writeFileSync(destAbs, buffer);
  return { relativePath: destRelative, kind };
}

function removeReferenceFile(projectRoot: string, referencePath: string | null) {
  if (!referencePath) return;
  try {
    const abs = path.join(projectRoot, referencePath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore missing files */
  }
}

function isFrontAngleName(name: string): boolean {
  return name.trim().toLowerCase().includes("front");
}

/**
 * When a Front reference is the active cover, clear other Front angles in the
 * same look so an older redhead Front cannot keep competing with the sheet
 * the user just accepted.
 */
export function clearStaleSiblingFrontAngleReferences(
  projectRoot: string,
  characterId: string,
  stateId: string,
  keepAngleId: string,
  options?: { resync?: boolean }
): void {
  const angles = listCharacterAngles(stateId);
  const keep = angles.find((angle) => angle.id === keepAngleId);
  if (!keep || !isFrontAngleName(keep.name)) return;

  const db = getDb();
  const ts = nowMs();
  let cleared = false;
  for (const angle of angles) {
    if (angle.id === keepAngleId) continue;
    if (!isFrontAngleName(angle.name)) continue;
    if (!angle.referencePath) continue;

    removeReferenceFile(projectRoot, angle.referencePath);
    db.update(schema.characterAngles)
      .set({
        referencePath: null,
        referenceKind: null,
        referenceSource: null,
        updatedAt: ts,
      })
      .where(eq(schema.characterAngles.id, angle.id))
      .run();
    cleared = true;
  }

  if (cleared && options?.resync !== false) {
    const stateWithAngles = listCharacterStates(characterId).find(
      (item) => item.id === stateId
    );
    if (stateWithAngles) {
      syncCharacterReferenceFromState(characterId, stateWithAngles, projectRoot);
    }
  }
}


export async function applyLocationAngleReferenceMedia(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string,
  buffer: Buffer,
  fileName: string,
  source: SheetReferenceMediaSource = "upload"
): Promise<{ angle: LocationAngle; relativePath: string; kind: "image" | "video" }> {
  const angle = getLocationAngle(projectId, locationId, stateId, angleId);
  if (!angle) throw new Error("Location angle not found");

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);
  const relativeDir = `locations/${locationId}/states/${stateId}/angles/${angleId}`;
  removeReferenceFile(projectRoot, angle.referencePath);

  const { relativePath, kind } = writeReferenceFile(
    projectRoot,
    relativeDir,
    buffer,
    fileName
  );

  const ts = nowMs();
  db.update(schema.locationAngles)
    .set({
      referencePath: relativePath,
      referenceKind: kind,
      referenceSource: source,
      updatedAt: ts,
    })
    .where(eq(schema.locationAngles.id, angleId))
    .run();

  const updated = db
    .select()
    .from(schema.locationAngles)
    .where(eq(schema.locationAngles.id, angleId))
    .get()!;

  const stateWithAngles = listLocationStates(locationId).find(
    (item) => item.id === stateId
  );
  if (stateWithAngles) {
    syncLocationReferenceFromState(locationId, stateWithAngles, projectRoot);
  }

  return { angle: updated, relativePath, kind };
}

export function clearLocationAngleReference(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string
): LocationAngle {
  const angle = getLocationAngle(projectId, locationId, stateId, angleId);
  if (!angle) throw new Error("Location angle not found");

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);
  removeReferenceFile(projectRoot, angle.referencePath);

  const ts = nowMs();
  db.update(schema.locationAngles)
    .set({
      referencePath: null,
      referenceKind: null,
      referenceSource: null,
      updatedAt: ts,
    })
    .where(eq(schema.locationAngles.id, angleId))
    .run();

  const updated = db
    .select()
    .from(schema.locationAngles)
    .where(eq(schema.locationAngles.id, angleId))
    .get()!;

  const stateWithAngles = listLocationStates(locationId).find(
    (item) => item.id === stateId
  );
  if (stateWithAngles) {
    syncLocationReferenceFromState(locationId, stateWithAngles, projectRoot);
  }

  return updated;
}

export async function applyCharacterAngleReferenceMedia(
  projectId: string,
  characterId: string,
  stateId: string,
  angleId: string,
  buffer: Buffer,
  fileName: string,
  source: SheetReferenceMediaSource = "upload"
): Promise<{ angle: CharacterAngle; relativePath: string; kind: "image" | "video" }> {
  const angle = getCharacterAngle(projectId, characterId, stateId, angleId);
  if (!angle) throw new Error("Character angle not found");

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);
  const relativeDir = `characters/${characterId}/states/${stateId}/angles/${angleId}`;
  removeReferenceFile(projectRoot, angle.referencePath);

  const { relativePath, kind } = writeReferenceFile(
    projectRoot,
    relativeDir,
    buffer,
    fileName
  );

  const ts = nowMs();
  db.update(schema.characterAngles)
    .set({
      referencePath: relativePath,
      referenceKind: kind,
      referenceSource: source,
      updatedAt: ts,
    })
    .where(eq(schema.characterAngles.id, angleId))
    .run();

  const updated = db
    .select()
    .from(schema.characterAngles)
    .where(eq(schema.characterAngles.id, angleId))
    .get()!;

  const stateWithAngles = listCharacterStates(characterId).find(
    (item) => item.id === stateId
  );
  if (stateWithAngles) {
    syncCharacterReferenceFromState(characterId, stateWithAngles, projectRoot);
  }
  clearStaleSiblingFrontAngleReferences(
    projectRoot,
    characterId,
    stateId,
    angleId,
    { resync: true }
  );

  return { angle: updated, relativePath, kind };
}

export function clearCharacterAngleReference(
  projectId: string,
  characterId: string,
  stateId: string,
  angleId: string
): CharacterAngle {
  const angle = getCharacterAngle(projectId, characterId, stateId, angleId);
  if (!angle) throw new Error("Character angle not found");

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);
  removeReferenceFile(projectRoot, angle.referencePath);

  const ts = nowMs();
  db.update(schema.characterAngles)
    .set({
      referencePath: null,
      referenceKind: null,
      referenceSource: null,
      updatedAt: ts,
    })
    .where(eq(schema.characterAngles.id, angleId))
    .run();

  const updated = db
    .select()
    .from(schema.characterAngles)
    .where(eq(schema.characterAngles.id, angleId))
    .get()!;

  const stateWithAngles = listCharacterStates(characterId).find(
    (item) => item.id === stateId
  );
  if (stateWithAngles) {
    syncCharacterReferenceFromState(characterId, stateWithAngles, projectRoot);
  }

  return updated;
}

export async function applyCharacterStateReferenceMedia(
  projectId: string,
  characterId: string,
  stateId: string,
  buffer: Buffer,
  fileName: string,
  source: SheetReferenceMediaSource = "upload"
): Promise<{ state: CharacterState; relativePath: string; kind: "image" | "video" }> {
  const state = getCharacterState(projectId, characterId, stateId);
  if (!state) throw new Error("Character state not found");

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);
  const relativeDir = `characters/${characterId}/states/${stateId}`;
  removeReferenceFile(projectRoot, state.referencePath);

  const { relativePath, kind } = writeReferenceFile(
    projectRoot,
    relativeDir,
    buffer,
    fileName
  );

  const ts = nowMs();
  db.update(schema.characterStates)
    .set({
      referencePath: relativePath,
      referenceKind: kind,
      referenceSource: source,
      updatedAt: ts,
    })
    .where(eq(schema.characterStates.id, stateId))
    .run();

  const updated = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .get()!;

  syncCharacterReferenceFromState(characterId, updated, projectRoot);

  return { state: updated, relativePath, kind };
}

export function clearCharacterStateReference(
  projectId: string,
  characterId: string,
  stateId: string
): CharacterState {
  const state = getCharacterState(projectId, characterId, stateId);
  if (!state) throw new Error("Character state not found");

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);
  removeReferenceFile(projectRoot, state.referencePath);

  const ts = nowMs();
  db.update(schema.characterStates)
    .set({
      referencePath: null,
      referenceKind: null,
      referenceSource: null,
      updatedAt: ts,
    })
    .where(eq(schema.characterStates.id, stateId))
    .run();

  const updated = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .get()!;

  syncCharacterReferenceFromState(characterId, updated, projectRoot);

  return updated;
}
