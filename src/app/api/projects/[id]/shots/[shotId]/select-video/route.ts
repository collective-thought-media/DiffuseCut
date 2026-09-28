import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { selectShotVideoFromJob } from "@/lib/services/shot-video-options";

interface SelectBody {
  jobId: string;
}

type RouteParams = {
  params: Promise<{ id: string; shotId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const body = await parseJson<SelectBody>(req);
    if (!body.jobId) {
      return jsonError("jobId is required", 400);
    }

    const result = selectShotVideoFromJob(projectId, shotId, body.jobId);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
