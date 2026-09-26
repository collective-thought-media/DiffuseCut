import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { duplicateSequence } from "@/lib/services/sequences";

type RouteParams = {
  params: Promise<{ id: string; sequenceId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, sequenceId } = await params;
    const body = await parseJson<{ name?: string }>(req).catch(
      () => ({}) as { name?: string }
    );
    const sequence = duplicateSequence(
      projectId,
      sequenceId,
      body.name
    );
    return jsonOk({ sequence }, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "Sequence not found") {
      return jsonError(err.message, 404);
    }
    return handleApiError(err);
  }
}
