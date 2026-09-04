import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  createLocationAngle,
  getLocationState,
  listLocationAngles,
} from "@/lib/services/location-states";

interface CreateAngleBody {
  name: string;
  viewDescription?: string;
}

type RouteParams = {
  params: Promise<{ id: string; locationId: string; stateId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId } = await params;
    if (!getLocationState(projectId, locationId, stateId)) {
      return jsonError("Location state not found", 404);
    }
    return jsonOk({ angles: listLocationAngles(stateId) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId } = await params;
    if (!getLocationState(projectId, locationId, stateId)) {
      return jsonError("Location state not found", 404);
    }

    const body = await parseJson<CreateAngleBody>(req);
    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }

    const angle = createLocationAngle({
      projectId,
      locationId,
      stateId,
      name: body.name,
      viewDescription: body.viewDescription,
    });

    return jsonOk({ angle }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
