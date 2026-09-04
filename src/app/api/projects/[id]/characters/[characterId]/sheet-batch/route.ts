import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import {
  discardCharacterSheetBatch,
  getActiveBatchForState,
  getBatchWithOptions,
} from "@/lib/services/asset-generation-queue";

type RouteParams = {
  params: Promise<{ id: string; characterId: string }>;
};

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { characterId } = await params;
    const stateId = req.nextUrl.searchParams.get("stateId");
    if (!stateId) {
      return jsonError("stateId query parameter is required", 400);
    }

    const batch = getActiveBatchForState(characterId, stateId);

    if (!batch) {
      return jsonError("No active character sheet batch", 404);
    }

    const data = getBatchWithOptions(batch.id);
    if (!data) {
      return jsonError("Batch not found", 404);
    }

    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId } = await params;
    const stateId = req.nextUrl.searchParams.get("stateId");
    if (!stateId) {
      return jsonError("stateId query parameter is required", 400);
    }
    discardCharacterSheetBatch(projectId, characterId, stateId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
