import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  enqueueShotPlaceholderBatch,
  getShotPlaceholderBatchView,
} from "@/lib/services/shot-asset-generation";

interface GenerateBody {
  count?: number;
  replace?: boolean;
}

type RouteParams = {
  params: Promise<{ id: string; shotId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const body = await parseJson<GenerateBody>(req);
    const count = body.count ?? 3;

    if (count < 2 || count > 4) {
      return jsonError("count must be between 2 and 4", 400);
    }

    const batch = await enqueueShotPlaceholderBatch(
      projectId,
      shotId,
      count,
      { replace: body.replace === true }
    );

    const view = getShotPlaceholderBatchView(shotId, batch.id);
    return jsonOk(view, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
