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

interface UpdateLocationBody {
  name?: string;
  description?: string;
  sortOrder?: number;
}

type RouteParams = {
  params: Promise<{ id: string; locationId: string }>;
};

function getLocation(projectId: string, locationId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.locations)
    .where(
      and(
        eq(schema.locations.id, locationId),
        eq(schema.locations.projectId, projectId)
      )
    )
    .get();
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId } = await params;
    const location = getLocation(projectId, locationId);
    if (!location) return jsonError("Location not found", 404);
    return jsonOk({ location });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId } = await params;
    const existing = getLocation(projectId, locationId);
    if (!existing) return jsonError("Location not found", 404);

    const body = await parseJson<UpdateLocationBody>(req);
    const db = getDb();
    const ts = nowMs();

    const updates: Partial<typeof existing> = { updatedAt: ts };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    db.update(schema.locations)
      .set(updates)
      .where(eq(schema.locations.id, locationId))
      .run();

    const location = db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.id, locationId))
      .get()!;

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()!;
    const entityDir = path.join(
      resolveProjectRoot(project),
      "locations",
      locationId
    );
    writeEntityMeta(entityDir, {
      id: location.id,
      name: location.name,
      description: location.description,
      referencePath: location.referencePath,
      referenceKind: location.referenceKind,
      referenceSource: location.referenceSource,
      updatedAt: location.updatedAt,
    });

    return jsonOk({ location });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId } = await params;
    const existing = getLocation(projectId, locationId);
    if (!existing) return jsonError("Location not found", 404);

    const db = getDb();
    db.delete(schema.locations)
      .where(eq(schema.locations.id, locationId))
      .run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (project) {
      const entityDir = path.join(
        resolveProjectRoot(project),
        "locations",
        locationId
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
