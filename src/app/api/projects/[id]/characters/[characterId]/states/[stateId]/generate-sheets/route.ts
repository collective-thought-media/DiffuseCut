import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { enqueueCharacterSheetBatch, getCharacterSheetBatchView } from "@/lib/services/asset-generation-queue";

interface GenerateSheetsBody {
  count?: number;
  replace?: boolean;
  /** Live UI description; falls back to saved character + state fields. */
  description?: string;
  extraNegativePrompt?: string;
}

type RouteParams = {
  params: Promise<{ id: string; characterId: string; stateId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    const body = await parseJson<GenerateSheetsBody>(req);
    const count = body.count ?? 3;

    if (count < 2 || count > 4) {
      return jsonError("count must be between 2 and 4", 400);
    }

    const batch = await enqueueCharacterSheetBatch(
      projectId,
      characterId,
      stateId,
      count,
      {
        replace: body.replace === true,
        descriptionOverride: body.description?.trim() || undefined,
        extraNegativePrompt: body.extraNegativePrompt?.trim() || undefined,
      }
    );

    const view = getCharacterSheetBatchView(characterId, stateId, batch.id);
    return jsonOk(view, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
