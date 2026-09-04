import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getBatchWithOptions } from "@/lib/services/asset-generation-queue";
import {
  discardLocationReferenceBatch,
  getDisplayBatchForLocationAngle,
} from "@/lib/services/location-asset-generation";

type RouteParams = {
  params: Promise<{
    id: string;
    locationId: string;
    stateId: string;
    angleId: string;
  }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { angleId } = await params;
    const batch = getDisplayBatchForLocationAngle(angleId);
    if (!batch) {
      return jsonError("No active location reference batch", 404);
    }
    const data = getBatchWithOptions(batch.id);
    if (!data) return jsonError("Batch not found", 404);
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId, angleId } = await params;
    discardLocationReferenceBatch(projectId, locationId, stateId, angleId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
