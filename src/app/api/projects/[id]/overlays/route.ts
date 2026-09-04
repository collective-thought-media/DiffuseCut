import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import {
  listTextOverlays,
  saveTextOverlays,
  type TextOverlayInput,
} from "@/lib/services/text-overlays";

type RouteParams = { params: Promise<{ id: string }> };

interface OverlaysBody {
  overlays: TextOverlayInput[];
}

function projectExists(projectId: string) {
  const db = getDb();
  return db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    if (!projectExists(projectId)) {
      return jsonError("Project not found", 404);
    }
    return jsonOk({ overlays: listTextOverlays(projectId) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    if (!projectExists(projectId)) {
      return jsonError("Project not found", 404);
    }

    const body = await parseJson<OverlaysBody>(req);
    if (!Array.isArray(body.overlays)) {
      return jsonError("overlays must be an array", 400);
    }

    const overlays = saveTextOverlays(projectId, body.overlays);
    return jsonOk({ overlays });
  } catch (err) {
    return handleApiError(err);
  }
}
