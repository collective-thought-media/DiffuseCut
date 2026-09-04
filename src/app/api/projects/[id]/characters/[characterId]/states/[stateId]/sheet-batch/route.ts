import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import {
  discardCharacterSheetBatch,
  getDisplayBatchForState,
  getBatchWithOptions,
} from "@/lib/services/asset-generation-queue";

type RouteParams = {
  params: Promise<{ id: string; characterId: string; stateId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { characterId, stateId } = await params;
    const batch = getDisplayBatchForState(characterId, stateId);
    if (!batch) {
      return jsonError("No active character sheet batch", 404);
    }
    const data = getBatchWithOptions(batch.id);
    if (!data) return jsonError("Batch not found", 404);
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    discardCharacterSheetBatch(projectId, characterId, stateId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
