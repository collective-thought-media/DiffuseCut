import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { selectLocationReferenceOption, getLocationReferenceBatchView } from "@/lib/services/location-asset-generation";

interface SelectBody {
  optionId: string;
}

type RouteParams = {
  params: Promise<{
    id: string;
    locationId: string;
    stateId: string;
    angleId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId, angleId } = await params;
    const body = await parseJson<SelectBody>(req);
    if (!body.optionId) {
      return jsonError("optionId is required", 400);
    }

    const location = await selectLocationReferenceOption(
      projectId,
      locationId,
      stateId,
      angleId,
      body.optionId
    );

    const view = getLocationReferenceBatchView(angleId);

    return jsonOk({ location, ...view });
  } catch (err) {
    return handleApiError(err);
  }
}
