import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  createCharacterAngle,
  getCharacterState,
  listCharacterAngles,
} from "@/lib/services/character-states";

interface CreateAngleBody {
  name: string;
  viewDescription?: string;
}

type RouteParams = {
  params: Promise<{ id: string; characterId: string; stateId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    if (!getCharacterState(projectId, characterId, stateId)) {
      return jsonError("Character state not found", 404);
    }
    return jsonOk({ angles: listCharacterAngles(stateId) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    if (!getCharacterState(projectId, characterId, stateId)) {
      return jsonError("Character state not found", 404);
    }

    const body = await parseJson<CreateAngleBody>(req);
    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }

    const angle = createCharacterAngle({
      projectId,
      characterId,
      stateId,
      name: body.name,
      viewDescription: body.viewDescription,
    });

    return jsonOk({ angle }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
