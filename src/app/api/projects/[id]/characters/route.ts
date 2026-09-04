import type { NextRequest } from "next/server";
import path from "path";
import { asc, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import {
  ensureProjectDirs,
  resolveProjectRoot,
  writeEntityMeta,
} from "@/lib/paths/project-paths";
import { nanoid, nowMs } from "@/lib/utils";
import { createCharacterState, listCharacterStates } from "@/lib/services/character-states";

interface CreateCharacterBody {
  name: string;
  description?: string;
}

type RouteParams = { params: Promise<{ id: string }> };

function getProjectOrNull(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    if (!getProjectOrNull(projectId)) {
      return jsonError("Project not found", 404);
    }

    const db = getDb();
    const characters = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.projectId, projectId))
      .orderBy(asc(schema.characters.sortOrder), asc(schema.characters.createdAt))
      .all()
      .map((character) => ({
        ...character,
        states: listCharacterStates(character.id),
      }));

    return jsonOk({ characters });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const project = getProjectOrNull(projectId);
    if (!project) return jsonError("Project not found", 404);

    const body = await parseJson<CreateCharacterBody>(req);
    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }

    const db = getDb();
    const existing = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.projectId, projectId))
      .all();
    const sortOrder = existing.length;

    const id = nanoid();
    const ts = nowMs();
    const row = {
      id,
      projectId,
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      referencePath: null,
      referenceKind: null,
      referenceSource: null,
      sortOrder,
      createdAt: ts,
      updatedAt: ts,
    };

    db.insert(schema.characters).values(row).run();

    ensureProjectDirs(project);
    const entityDir = path.join(resolveProjectRoot(project), "characters", id);
    writeEntityMeta(entityDir, {
      id,
      name: row.name,
      description: row.description,
      referencePath: null,
      referenceKind: null,
      referenceSource: null,
      updatedAt: ts,
    });

    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, id))
      .get()!;

    createCharacterState({
      projectId,
      characterId: id,
      name: "Default look",
      lookDescription: row.description,
    });

    return jsonOk({ character }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
