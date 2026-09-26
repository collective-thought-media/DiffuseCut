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
  createSequence,
  ensureProjectHasSequence,
  listSequencesForProject,
} from "@/lib/services/sequences";

type RouteParams = { params: Promise<{ id: string }> };

function getProject(projectId: string) {
  return getDb()
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const project = getProject(projectId);
    if (!project) return jsonError("Project not found", 404);
    let sequences = listSequencesForProject(projectId);
    if (sequences.length === 0) {
      ensureProjectHasSequence(projectId, project.defaultFps);
      sequences = listSequencesForProject(projectId);
    }
    return jsonOk({ sequences });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const project = getProject(projectId);
    if (!project) return jsonError("Project not found", 404);
    const body = await parseJson<{ name?: string }>(req);
    const sequence = createSequence(
      projectId,
      body.name?.trim() || "New sequence",
      project.defaultFps
    );
    return jsonOk({ sequence }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
