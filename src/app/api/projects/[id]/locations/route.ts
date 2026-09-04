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
import {
  createDefaultLocationStateAndAngle,
  listLocationStates,
} from "@/lib/services/location-states";
import { nanoid, nowMs } from "@/lib/utils";

interface CreateLocationBody {
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
    const locations = db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.projectId, projectId))
      .orderBy(asc(schema.locations.sortOrder), asc(schema.locations.createdAt))
      .all()
      .map((location) => ({
        ...location,
        states: listLocationStates(location.id),
      }));

    return jsonOk({ locations });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const project = getProjectOrNull(projectId);
    if (!project) return jsonError("Project not found", 404);

    const body = await parseJson<CreateLocationBody>(req);
    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }

    const db = getDb();
    const existing = db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.projectId, projectId))
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

    db.insert(schema.locations).values(row).run();

    ensureProjectDirs(project);
    const entityDir = path.join(resolveProjectRoot(project), "locations", id);
    writeEntityMeta(entityDir, {
      id,
      name: row.name,
      description: row.description,
      referencePath: null,
      referenceKind: null,
      referenceSource: null,
      updatedAt: ts,
    });

    createDefaultLocationStateAndAngle({
      projectId,
      locationId: id,
      description: row.description,
    });

    const location = db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.id, id))
      .get()!;

    return jsonOk(
      {
        location: {
          ...location,
          states: listLocationStates(id),
        },
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
