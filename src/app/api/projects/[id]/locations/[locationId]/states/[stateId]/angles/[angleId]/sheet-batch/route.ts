import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import {
  discardLocationReferenceBatch,
  getLocationReferenceBatchView,
} from "@/lib/services/location-asset-generation";

type RouteParams = {
  params: Promise<{
    id: string;
    locationId: string;
    stateId: string;
    angleId: string;
  }>;
};

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { angleId } = await params;
    const batchId = req.nextUrl.searchParams.get("batchId");
    const view = getLocationReferenceBatchView(angleId, batchId);
    if (!view.batch && view.packs.length === 0) {
      return jsonError("No active location reference batch", 404);
    }
    return jsonOk(view);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId, angleId } = await params;
    const batchId = req.nextUrl.searchParams.get("batchId");
    discardLocationReferenceBatch(
      projectId,
      locationId,
      stateId,
      angleId,
      batchId ?? undefined
    );
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
