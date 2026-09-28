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
import { mergeLocationAngleGenerationOverrides } from "@/lib/location-angle-generation-overrides";

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
      stillNegativePrompt?: string;
      generationOverridesJson?: string | null;
    }>(req);

    const existing = getLocationAngle(projectId, locationId, stateId, angleId);
    if (!existing) return jsonError("Location angle not found", 404);

    let generationOverridesJson = body.generationOverridesJson;
    if (body.stillNegativePrompt !== undefined) {
      generationOverridesJson = mergeLocationAngleGenerationOverrides(
        existing.generationOverridesJson,
        { stillNegativePrompt: body.stillNegativePrompt }
      );
    }
    if (
      generationOverridesJson !== undefined &&
      generationOverridesJson !== null
    ) {
      try {
        JSON.parse(generationOverridesJson);
      } catch {
        return jsonError("generationOverridesJson must be valid JSON", 400);
      }
    }

    const angle = updateLocationAngle(projectId, locationId, stateId, angleId, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.viewDescription !== undefined
        ? { viewDescription: body.viewDescription }
        : {}),
      ...(generationOverridesJson !== undefined
        ? { generationOverridesJson }
        : {}),
    });
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
