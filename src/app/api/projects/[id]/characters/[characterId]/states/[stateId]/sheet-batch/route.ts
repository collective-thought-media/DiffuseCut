import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import {
  discardCharacterSheetBatch,
  getCharacterSheetBatchView,
} from "@/lib/services/asset-generation-queue";

type RouteParams = {
  params: Promise<{ id: string; characterId: string; stateId: string }>;
};

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { characterId, stateId } = await params;
    const batchId = req.nextUrl.searchParams.get("batchId");
    const view = getCharacterSheetBatchView(characterId, stateId, batchId);
    if (!view.batch && view.packs.length === 0) {
      return jsonError("No active character sheet batch", 404);
    }
    return jsonOk(view);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    const batchId = req.nextUrl.searchParams.get("batchId");
    discardCharacterSheetBatch(
      projectId,
      characterId,
      stateId,
      batchId ?? undefined
    );
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
