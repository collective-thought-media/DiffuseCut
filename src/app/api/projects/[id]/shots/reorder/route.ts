import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { nowMs } from "@/lib/utils";
import { resolveSequenceId } from "@/lib/services/sequence-scope";

interface ReorderBody {
  orderedIds: string[];
  sequenceId?: string;
}

type RouteParams = { params: Promise<{ id: string }> };

async function handleReorder(req: NextRequest, { params }: RouteParams) {
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

    const sequenceId = resolveSequenceId(projectId, body.sequenceId);

    const shots = db
      .select()
      .from(schema.shots)
      .where(
        and(
          eq(schema.shots.projectId, projectId),
          eq(schema.shots.sequenceId, sequenceId)
        )
      )
      .all();

    const shotIds = new Set(shots.map((shot) => shot.id));
    if (body.orderedIds.length !== shots.length) {
      return jsonError(
        "orderedIds must include every shot in this sequence exactly once",
        400
      );
    }

    const seen = new Set<string>();
    for (const id of body.orderedIds) {
      if (!shotIds.has(id)) {
        return jsonError(`Shot not found in sequence: ${id}`, 404);
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

export async function POST(req: NextRequest, ctx: RouteParams) {
  return handleReorder(req, ctx);
}

export async function PUT(req: NextRequest, ctx: RouteParams) {
  return handleReorder(req, ctx);
}
