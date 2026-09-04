import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import {
  createCharacterState,
  listCharacterStates,
} from "@/lib/services/character-states";

interface CreateStateBody {
  name: string;
  lookDescription?: string;
  timelineNote?: string;
}

type RouteParams = {
  params: Promise<{ id: string; characterId: string }>;
};

function assertCharacter(projectId: string, characterId: string) {
  const db = getDb();
  const character = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId))
    .get();
  if (!character || character.projectId !== projectId) {
    return null;
  }
  return character;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId } = await params;
    if (!assertCharacter(projectId, characterId)) {
      return jsonError("Character not found", 404);
    }
    return jsonOk({ states: listCharacterStates(characterId) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId } = await params;
    if (!assertCharacter(projectId, characterId)) {
      return jsonError("Character not found", 404);
    }

    const body = await parseJson<CreateStateBody>(req);
    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }

    const state = createCharacterState({
      projectId,
      characterId,
      name: body.name,
      lookDescription: body.lookDescription,
      timelineNote: body.timelineNote,
    });

    return jsonOk({ state }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
