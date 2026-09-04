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
}

type RouteParams = {
  params: Promise<{ id: string; characterId: string; stateId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    const body = await parseJson<SelectSheetBody>(req);
    if (!body.optionId) {
      return jsonError("optionId is required", 400);
    }

    const character = await selectCharacterSheetOption(
      projectId,
      characterId,
      stateId,
      body.optionId
    );

    return jsonOk({ character });
  } catch (err) {
    return handleApiError(err);
  }
}
