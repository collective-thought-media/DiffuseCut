import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { selectCharacterSheetOption } from "@/lib/services/asset-generation-queue";

interface SelectSheetBody {
  optionId: string;
  stateId?: string;
}

type RouteParams = {
  params: Promise<{ id: string; characterId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId } = await params;
    const body = await parseJson<SelectSheetBody>(req);

    if (!body.optionId?.trim()) {
      return jsonError("optionId is required", 400);
    }

    if (!body.stateId) {
      return jsonError("stateId is required", 400);
    }

    const character = await selectCharacterSheetOption(
      projectId,
      characterId,
      body.stateId,
      body.optionId
    );

    return jsonOk({ character });
  } catch (err) {
    return handleApiError(err);
  }
}
