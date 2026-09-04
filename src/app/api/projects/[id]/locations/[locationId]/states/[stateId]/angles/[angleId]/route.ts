import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  deleteLocationAngle,
  getLocationAngle,
  updateLocationAngle,
} from "@/lib/services/location-states";

type RouteParams = {
  params: Promise<{
    id: string;
    locationId: string;
    stateId: string;
    angleId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId, angleId } = await params;
    const body = await parseJson<{
      name?: string;
      viewDescription?: string;
    }>(req);

    const angle = updateLocationAngle(
      projectId,
      locationId,
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
    const { id: projectId, locationId, stateId, angleId } = await params;
    if (!getLocationAngle(projectId, locationId, stateId, angleId)) {
      return jsonError("Location angle not found", 404);
    }
    deleteLocationAngle(projectId, locationId, stateId, angleId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
