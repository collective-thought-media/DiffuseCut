import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { enqueueCharacterSheetBatch, getBatchWithOptions } from "@/lib/services/asset-generation-queue";

interface GenerateSheetsBody {
  count?: number;
  replace?: boolean;
  stateId?: string;
}

type RouteParams = {
  params: Promise<{ id: string; characterId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId } = await params;
    const body = await parseJson<GenerateSheetsBody>(req);
    const count = body.count ?? 3;

    if (count < 2 || count > 4) {
      return jsonError("count must be between 2 and 4", 400);
    }

    if (!body.stateId) {
      return jsonError("stateId is required", 400);
    }

    const batch = await enqueueCharacterSheetBatch(
      projectId,
      characterId,
      body.stateId,
      count,
      { replace: body.replace === true }
    );

    const data = getBatchWithOptions(batch.id);
    if (!data) {
      return jsonError("Failed to load new batch", 500);
    }

    return jsonOk(
      { batchId: batch.id, batch: data.batch, options: data.options },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
