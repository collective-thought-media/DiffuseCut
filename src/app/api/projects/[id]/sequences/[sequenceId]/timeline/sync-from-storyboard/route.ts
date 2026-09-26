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
  getTimelineState,
  saveTimelineState,
} from "@/lib/services/sequences";
import { buildTimelineFromShots } from "@/lib/services/timeline-sync";

type RouteParams = {
  params: Promise<{ id: string; sequenceId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, sequenceId } = await params;
    const project = getDb()
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) return jsonError("Project not found", 404);

    const body = await parseJson<{ mode?: "replace" | "merge" }>(req).catch(
      () => ({ mode: "replace" as const })
    );
    const existing = getTimelineState(projectId, sequenceId);
    if (!existing) return jsonError("Sequence not found", 404);

    const built = buildTimelineFromShots(
      projectId,
      sequenceId,
      project.defaultFps,
      body.mode === "merge" ? existing : undefined
    );
    saveTimelineState(projectId, sequenceId, built);
    return jsonOk({ timeline: built });
  } catch (err) {
    return handleApiError(err);
  }
}
