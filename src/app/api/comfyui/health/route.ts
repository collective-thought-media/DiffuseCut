import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import {
  healthCheck,
  listEndpoints,
} from "@/lib/services/comfyui-client";
import {
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return jsonError("projectId is required", 400);

    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) return jsonError("Project not found", 404);

    const appEndpoints = await getDefaultComfyuiEndpoints();
    const endpoints = resolveComfyuiEndpoints(
      project.comfyuiEndpointsJson,
      appEndpoints
    );

    const checks = await Promise.all(
      endpoints.map(async (url) => ({
        url,
        healthy: await healthCheck(url),
      }))
    );

    const activeEndpoint = await listEndpoints(endpoints);

    return jsonOk({
      healthy: !!activeEndpoint,
      endpoint: activeEndpoint,
      endpoints: checks,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
