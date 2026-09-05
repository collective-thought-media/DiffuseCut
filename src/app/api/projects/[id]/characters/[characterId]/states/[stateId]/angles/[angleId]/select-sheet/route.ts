import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  selectCharacterAngleReferenceOption,
  getCharacterReferenceBatchView,
} from "@/lib/services/character-asset-generation";

interface SelectBody {
  optionId: string;
  panel?: "full" | "left" | "right";
  splitPair?: { frontAngleId: string; backAngleId: string };
}

type RouteParams = {
  params: Promise<{
    id: string;
    characterId: string;
    stateId: string;
    angleId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId, angleId } = await params;
    const body = await parseJson<SelectBody>(req);
    if (!body.optionId) {
      return jsonError("optionId is required", 400);
    }

    const character = await selectCharacterAngleReferenceOption(
      projectId,
      characterId,
      stateId,
      angleId,
      body.optionId,
      {
        panel: body.panel,
        splitPair: body.splitPair,
      }
    );

    const view = getCharacterReferenceBatchView(angleId);

    return jsonOk({ character, ...view });
  } catch (err) {
    return handleApiError(err);
  }
}
