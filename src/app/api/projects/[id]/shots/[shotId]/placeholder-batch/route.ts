import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import {
  discardShotPlaceholderBatch,
  getShotPlaceholderBatchView,
  stopShotPlaceholderGeneration,
} from "@/lib/services/shot-asset-generation";

type RouteParams = {
  params: Promise<{ id: string; shotId: string }>;
};

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { shotId } = await params;
    const batchId = req.nextUrl.searchParams.get("batchId");
    const view = getShotPlaceholderBatchView(shotId, batchId);

    if (!view.batch && view.packs.length === 0) {
      return jsonError("No active shot placeholder batch", 404);
    }

    return jsonOk(view);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const batchId = req.nextUrl.searchParams.get("batchId");
    const stopOnly = req.nextUrl.searchParams.get("stop") === "1";

    if (stopOnly) {
      await stopShotPlaceholderGeneration(
        projectId,
        shotId,
        batchId ?? undefined
      );
      const view = getShotPlaceholderBatchView(shotId, batchId);
      return jsonOk({ ok: true, ...view });
    }

    discardShotPlaceholderBatch(projectId, shotId, batchId ?? undefined);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
