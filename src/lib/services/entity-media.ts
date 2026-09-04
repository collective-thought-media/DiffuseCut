import path from "path";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  resolveProjectRoot,
  writeEntityMeta,
} from "@/lib/paths/project-paths";
import { saveFileToProject } from "@/lib/services/file-manager";
import {
  mediaKindFromExtension,
  sanitizeFileName,
} from "@/lib/services/media-import";
import { nowMs } from "@/lib/utils";

export type EntityMediaType = "character" | "location" | "shot" | "audio";
export type EntityMediaSource = "upload" | "url";

export async function applyEntityMedia(
  projectId: string,
  entityType: EntityMediaType,
  entityId: string,
  buffer: Buffer,
  fileName: string,
  source: EntityMediaSource = "upload"
) {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);
  const safeName = sanitizeFileName(fileName);
  const kind = mediaKindFromExtension(safeName);
  const ts = nowMs();

  switch (entityType) {
    case "character": {
      const character = db
        .select()
        .from(schema.characters)
        .where(
          and(
            eq(schema.characters.id, entityId),
            eq(schema.characters.projectId, projectId)
          )
        )
        .get();
      if (!character) throw new Error("Character not found");

      const entityDir = `characters/${entityId}`;
      const relativePath = saveFileToProject(
        projectRoot,
        entityDir,
        safeName,
        buffer
      );

      db.update(schema.characters)
        .set({
          referencePath: relativePath,
          referenceKind: kind,
          referenceSource: source,
          updatedAt: ts,
        })
        .where(eq(schema.characters.id, entityId))
        .run();

      const updated = db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, entityId))
        .get()!;

      writeEntityMeta(path.join(projectRoot, entityDir), {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        referencePath: updated.referencePath,
        referenceKind: updated.referenceKind,
        referenceSource: updated.referenceSource,
        updatedAt: updated.updatedAt,
      });

      return { entity: updated, relativePath, kind };
    }

    case "location": {
      const location = db
        .select()
        .from(schema.locations)
        .where(
          and(
            eq(schema.locations.id, entityId),
            eq(schema.locations.projectId, projectId)
          )
        )
        .get();
      if (!location) throw new Error("Location not found");

      const entityDir = `locations/${entityId}`;
      const relativePath = saveFileToProject(
        projectRoot,
        entityDir,
        safeName,
        buffer
      );

      db.update(schema.locations)
        .set({
          referencePath: relativePath,
          referenceKind: kind,
          referenceSource: source,
          updatedAt: ts,
        })
        .where(eq(schema.locations.id, entityId))
        .run();

      const updated = db
        .select()
        .from(schema.locations)
        .where(eq(schema.locations.id, entityId))
        .get()!;

      writeEntityMeta(path.join(projectRoot, entityDir), {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        referencePath: updated.referencePath,
        referenceKind: updated.referenceKind,
        referenceSource: updated.referenceSource,
        updatedAt: updated.updatedAt,
      });

      return { entity: updated, relativePath, kind };
    }

    case "shot": {
      const shot = db
        .select()
        .from(schema.shots)
        .where(
          and(
            eq(schema.shots.id, entityId),
            eq(schema.shots.projectId, projectId)
          )
        )
        .get();
      if (!shot) throw new Error("Shot not found");

      const entityDir = `storyboard/shots/${entityId}`;
      const relativePath = saveFileToProject(
        projectRoot,
        entityDir,
        safeName,
        buffer
      );

      db.update(schema.shots)
        .set({
          placeholderPath: relativePath,
          placeholderKind: kind,
          updatedAt: ts,
        })
        .where(eq(schema.shots.id, entityId))
        .run();

      const updated = db
        .select()
        .from(schema.shots)
        .where(eq(schema.shots.id, entityId))
        .get()!;

      return { entity: updated, relativePath, kind };
    }

    case "audio": {
      const track = db
        .select()
        .from(schema.audioTracks)
        .where(
          and(
            eq(schema.audioTracks.id, entityId),
            eq(schema.audioTracks.projectId, projectId)
          )
        )
        .get();
      if (!track) throw new Error("Audio track not found");

      const relativePath = saveFileToProject(
        projectRoot,
        "audio/tracks",
        safeName,
        buffer
      );

      db.update(schema.audioTracks)
        .set({
          filePath: relativePath,
          updatedAt: ts,
        })
        .where(eq(schema.audioTracks.id, entityId))
        .run();

      const updated = db
        .select()
        .from(schema.audioTracks)
        .where(eq(schema.audioTracks.id, entityId))
        .get()!;

      return { entity: updated, relativePath, kind: null };
    }

    default:
      throw new Error(`Unsupported entity type: ${entityType as string}`);
  }
}
