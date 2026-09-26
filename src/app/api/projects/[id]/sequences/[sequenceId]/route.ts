import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  deleteSequence,
  getSequence,
  renameSequence,
} from "@/lib/services/sequences";

type RouteParams = {
  params: Promise<{ id: string; sequenceId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, sequenceId } = await params;
    const sequence = getSequence(projectId, sequenceId);
    if (!sequence) return jsonError("Sequence not found", 404);
    return jsonOk({ sequence });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, sequenceId } = await params;
    const body = await parseJson<{ name?: string }>(req);
    if (!body.name?.trim()) return jsonError("name is required", 400);
    const sequence = renameSequence(projectId, sequenceId, body.name);
    if (!sequence) return jsonError("Sequence not found", 404);
    return jsonOk({ sequence });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, sequenceId } = await params;
    deleteSequence(projectId, sequenceId);
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("last sequence")) {
      return jsonError(err.message, 400);
    }
    return handleApiError(err);
  }
}
