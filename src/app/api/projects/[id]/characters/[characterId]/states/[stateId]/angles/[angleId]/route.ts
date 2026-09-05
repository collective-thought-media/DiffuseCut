import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  deleteCharacterAngle,
  getCharacterAngle,
  updateCharacterAngle,
} from "@/lib/services/character-states";

type RouteParams = {
  params: Promise<{
    id: string;
    characterId: string;
    stateId: string;
    angleId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId, angleId } = await params;
    const body = await parseJson<{
      name?: string;
      viewDescription?: string;
    }>(req);

    const angle = updateCharacterAngle(
      projectId,
      characterId,
      stateId,
      angleId,
      body
    );
    return jsonOk({ angle });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId, angleId } = await params;
    if (!getCharacterAngle(projectId, characterId, stateId, angleId)) {
      return jsonError("Character angle not found", 404);
    }
    deleteCharacterAngle(projectId, characterId, stateId, angleId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
