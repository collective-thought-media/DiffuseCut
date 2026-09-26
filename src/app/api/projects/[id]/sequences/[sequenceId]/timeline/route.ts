import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import type { TimelineState } from "@/lib/timeline/types";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  getTimelineState,
  saveTimelineState,
} from "@/lib/services/sequences";

type RouteParams = {
  params: Promise<{ id: string; sequenceId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, sequenceId } = await params;
    const project = getDb()
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) return jsonError("Project not found", 404);

    const timeline = getTimelineState(projectId, sequenceId, {
      syncFromStoryboardIfEmpty: true,
      fps: project.defaultFps,
    });
    if (!timeline) return jsonError("Sequence not found", 404);
    return jsonOk({ timeline });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, sequenceId } = await params;
    const body = await parseJson<{ timeline: TimelineState }>(req);
    if (!body.timeline) return jsonError("timeline is required", 400);
    const timeline = saveTimelineState(
      projectId,
      sequenceId,
      body.timeline
    );
    return jsonOk({ timeline });
  } catch (err) {
    if (err instanceof Error && err.message === "Sequence not found") {
      return jsonError(err.message, 404);
    }
    return handleApiError(err);
  }
}
