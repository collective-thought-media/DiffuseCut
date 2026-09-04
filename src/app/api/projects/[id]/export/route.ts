import type { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const db = getDb();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) return jsonError("Project not found", 404);

    const jobs = db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.projectId, projectId))
      .orderBy(desc(schema.exportJobs.createdAt))
      .all()
      .slice(0, 8);

    return jsonOk({ jobs });
  } catch (err) {
    return handleApiError(err);
  }
}
