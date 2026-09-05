import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  enqueueShotImageEditBatch,
  getShotPlaceholderBatchView,
} from "@/lib/services/shot-asset-generation";

interface ImageEditBody {
  optionId?: string;
  instruction?: string;
  count?: number;
  replace?: boolean;
}

type RouteParams = {
  params: Promise<{ id: string; shotId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const body = await parseJson<ImageEditBody>(req);

    if (!body.optionId) {
      return jsonError("optionId is required", 400);
    }
    if (!body.instruction?.trim()) {
      return jsonError("instruction is required", 400);
    }
    const count = body.count ?? 2;
    if (count < 1 || count > 4) {
      return jsonError("count must be between 1 and 4", 400);
    }

    const batch = await enqueueShotImageEditBatch(
      projectId,
      shotId,
      body.optionId,
      body.instruction,
      count,
      { replace: body.replace === true }
    );

    const view = getShotPlaceholderBatchView(shotId, batch.id);
    return jsonOk(view, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
