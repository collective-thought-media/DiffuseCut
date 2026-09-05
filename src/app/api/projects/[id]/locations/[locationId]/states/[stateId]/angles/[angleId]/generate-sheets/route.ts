import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { enqueueLocationReferenceBatch, getLocationReferenceBatchView } from "@/lib/services/location-asset-generation";

import type { LocationReferenceGenerationOptions } from "@/types";

interface GenerateBody {
  count?: number;
  replace?: boolean;
  generationOptions?: LocationReferenceGenerationOptions;
  extraNegativePrompt?: string;
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
    const body = await parseJson<GenerateBody>(req);
    const count = body.count ?? 3;

    if (count < 2 || count > 4) {
      return jsonError("count must be between 2 and 4", 400);
    }

    const batch = await enqueueLocationReferenceBatch(
      projectId,
      locationId,
      stateId,
      angleId,
      count,
      {
        replace: body.replace === true,
        generationOptions: body.generationOptions,
        extraNegativePrompt: body.extraNegativePrompt?.trim() || undefined,
      }
    );

    const view = getLocationReferenceBatchView(angleId, batch.id);
    return jsonOk(view, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
