import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { getModelsForFolder } from "@/lib/services/comfyui-inventory";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    const folder = req.nextUrl.searchParams.get("folder");

    if (!projectId) return jsonError("projectId is required", 400);
    if (!folder?.trim()) return jsonError("folder is required", 400);

    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) return jsonError("Project not found", 404);

    const models = await getModelsForFolder(projectId, folder.trim());
    return jsonOk({ folder: folder.trim(), models });
  } catch (err) {
    return handleApiError(err);
  }
}
