import type { NextRequest } from "next/server";
import { jsonOk, handleApiError } from "@/lib/api-helpers";
import { listCompletedRenderJobsForShot } from "@/lib/services/shot-video-options";

type RouteParams = {
  params: Promise<{ id: string; shotId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const options = listCompletedRenderJobsForShot(projectId, shotId);
    return jsonOk({ options });
  } catch (err) {
    return handleApiError(err);
  }
}
