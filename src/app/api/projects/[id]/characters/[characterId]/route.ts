import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { resolveProjectRoot, writeEntityMeta } from "@/lib/paths/project-paths";
import { nowMs } from "@/lib/utils";

interface UpdateCharacterBody {
  name?: string;
  description?: string;
  sortOrder?: number;
}

type RouteParams = {
  params: Promise<{ id: string; characterId: string }>;
};

function getCharacter(projectId: string, characterId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.id, characterId),
        eq(schema.characters.projectId, projectId)
      )
    )
    .get();
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId } = await params;
    const character = getCharacter(projectId, characterId);
    if (!character) return jsonError("Character not found", 404);
    return jsonOk({ character });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId } = await params;
    const existing = getCharacter(projectId, characterId);
    if (!existing) return jsonError("Character not found", 404);

    const body = await parseJson<UpdateCharacterBody>(req);
    const db = getDb();
    const ts = nowMs();

    const updates: Partial<typeof existing> = { updatedAt: ts };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    db.update(schema.characters)
      .set(updates)
      .where(eq(schema.characters.id, characterId))
      .run();

    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, characterId))
      .get()!;

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()!;
    const entityDir = path.join(
      resolveProjectRoot(project),
      "characters",
      characterId
    );
    writeEntityMeta(entityDir, {
      id: character.id,
      name: character.name,
      description: character.description,
      referencePath: character.referencePath,
      referenceKind: character.referenceKind,
      referenceSource: character.referenceSource,
      updatedAt: character.updatedAt,
    });

    return jsonOk({ character });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId } = await params;
    const existing = getCharacter(projectId, characterId);
    if (!existing) return jsonError("Character not found", 404);

    const db = getDb();
    db.delete(schema.characters)
      .where(eq(schema.characters.id, characterId))
      .run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (project) {
      const entityDir = path.join(
        resolveProjectRoot(project),
        "characters",
        characterId
      );
      if (fs.existsSync(entityDir)) {
        fs.rmSync(entityDir, { recursive: true, force: true });
      }
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
