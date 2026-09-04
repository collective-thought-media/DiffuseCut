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
  createLocationState,
  listLocationStates,
} from "@/lib/services/location-states";

interface CreateStateBody {
  name: string;
  lookDescription?: string;
  timelineNote?: string;
}

type RouteParams = {
  params: Promise<{ id: string; locationId: string }>;
};

function assertLocation(projectId: string, locationId: string) {
  const db = getDb();
  const location = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId))
    .get();
  if (!location || location.projectId !== projectId) return null;
  return location;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId } = await params;
    if (!assertLocation(projectId, locationId)) {
      return jsonError("Location not found", 404);
    }
    return jsonOk({ states: listLocationStates(locationId) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId } = await params;
    if (!assertLocation(projectId, locationId)) {
      return jsonError("Location not found", 404);
    }

    const body = await parseJson<CreateStateBody>(req);
    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }

    const state = createLocationState({
      projectId,
      locationId,
      name: body.name,
      lookDescription: body.lookDescription,
      timelineNote: body.timelineNote,
    });

    return jsonOk({ state }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
