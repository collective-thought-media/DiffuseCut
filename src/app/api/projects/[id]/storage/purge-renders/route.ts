import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { purgeOrphanedRenders } from "@/lib/services/storage-cleanup";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) return jsonError("Project not found", 404);

    const purged = purgeOrphanedRenders(projectId);
    const freedBytes = purged.reduce((sum, file) => sum + file.sizeBytes, 0);

    return jsonOk({
      purgedCount: purged.length,
      freedBytes,
      files: purged,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
