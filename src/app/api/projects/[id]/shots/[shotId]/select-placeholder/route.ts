import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  selectShotPlaceholderOption,
  getShotPlaceholderBatchView,
} from "@/lib/services/shot-asset-generation";

interface SelectBody {
  optionId: string;
}

type RouteParams = {
  params: Promise<{ id: string; shotId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const body = await parseJson<SelectBody>(req);
    if (!body.optionId) {
      return jsonError("optionId is required", 400);
    }

    const shot = await selectShotPlaceholderOption(
      projectId,
      shotId,
      body.optionId
    );

    const view = getShotPlaceholderBatchView(shotId);

    return jsonOk({
      shot,
      ...view,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
