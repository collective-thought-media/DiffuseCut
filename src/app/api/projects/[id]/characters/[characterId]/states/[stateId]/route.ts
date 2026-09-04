import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  deleteCharacterState,
  getCharacterState,
  listCharacterStates,
  updateCharacterState,
} from "@/lib/services/character-states";

interface UpdateStateBody {
  name?: string;
  lookDescription?: string;
  timelineNote?: string;
  sortOrder?: number;
}

type RouteParams = {
  params: Promise<{ id: string; characterId: string; stateId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    const state = getCharacterState(projectId, characterId, stateId);
    if (!state) return jsonError("Character state not found", 404);
    return jsonOk({ state });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    const body = await parseJson<UpdateStateBody>(req);
    const state = updateCharacterState(projectId, characterId, stateId, body);
    return jsonOk({ state });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    const states = listCharacterStates(characterId);
    if (states.length <= 1) {
      return jsonError("A character must keep at least one visual state", 400);
    }
    deleteCharacterState(projectId, characterId, stateId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
