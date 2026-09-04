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
  getModelsForFolder,
  invalidateModelCache,
} from "@/lib/services/comfyui-inventory";

interface RefreshBody {
  projectId: string;
  folder?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson<RefreshBody>(req);
    if (!body.projectId) return jsonError("projectId is required", 400);

    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, body.projectId))
      .get();

    if (!project) return jsonError("Project not found", 404);

    await invalidateModelCache(body.projectId, body.folder);

    if (body.folder) {
      const models = await getModelsForFolder(body.projectId, body.folder);
      return jsonOk({ folder: body.folder, models, refreshed: true });
    }

    return jsonOk({ refreshed: true });
  } catch (err) {
    return handleApiError(err);
  }
}
