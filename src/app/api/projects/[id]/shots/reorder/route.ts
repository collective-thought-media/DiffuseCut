import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { nowMs } from "@/lib/utils";

interface ReorderBody {
  orderedIds: string[];
}

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const db = getDb();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) return jsonError("Project not found", 404);

    const body = await parseJson<ReorderBody>(req);
    if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
      return jsonError("orderedIds must be a non-empty array", 400);
    }

    const shots = db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.projectId, projectId))
      .all();

    const shotIds = new Set(shots.map((shot) => shot.id));
    if (body.orderedIds.length !== shots.length) {
      return jsonError("orderedIds must include every shot exactly once", 400);
    }

    const seen = new Set<string>();
    for (const id of body.orderedIds) {
      if (!shotIds.has(id)) {
        return jsonError(`Shot not found: ${id}`, 404);
      }
      if (seen.has(id)) {
        return jsonError("orderedIds contains duplicates", 400);
      }
      seen.add(id);
    }

    const ts = nowMs();
    body.orderedIds.forEach((id, sortOrder) => {
      db.update(schema.shots)
        .set({ sortOrder, updatedAt: ts })
        .where(eq(schema.shots.id, id))
        .run();
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
