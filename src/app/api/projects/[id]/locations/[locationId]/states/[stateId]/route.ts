import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  deleteLocationState,
  getLocationState,
  updateLocationState,
} from "@/lib/services/location-states";

type RouteParams = {
  params: Promise<{ id: string; locationId: string; stateId: string }>;
};

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId } = await params;
    const body = await parseJson<{
      name?: string;
      lookDescription?: string;
      timelineNote?: string;
    }>(req);

    const state = updateLocationState(projectId, locationId, stateId, body);
    return jsonOk({ state });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId } = await params;
    if (!getLocationState(projectId, locationId, stateId)) {
      return jsonError("Location state not found", 404);
    }
    deleteLocationState(projectId, locationId, stateId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
