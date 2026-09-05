import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { assertDependency } from "@/lib/services/dependency-checker";
import {
  enqueueLipSyncRenderJobs,
  planLipSyncShots,
} from "@/lib/services/lip-sync";

/** Preview which shots would get a lip sync render and their dialog coverage. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { fps, plans } = planLipSyncShots(id);
    return jsonOk({
      fps,
      shots: plans.map((plan) => ({
        shotId: plan.shot.id,
        title: plan.shot.title,
        dialogSeconds: plan.slices.reduce(
          (sum, slice) => sum + slice.durationSec,
          0
        ),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Slice dialog audio per shot and queue audio-conditioned LTX renders. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertDependency("comfyui");
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      shotIds?: string[];
    };
    const { jobs, shotsPlanned } = await enqueueLipSyncRenderJobs(id, {
      shotIds: Array.isArray(body.shotIds) ? body.shotIds : undefined,
    });
    return jsonOk({ jobs, shotsPlanned }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No shots overlap")) {
      return jsonError(err.message, 400);
    }
    if (err instanceof Error && err.message.includes("already queued")) {
      return jsonError(err.message, 409);
    }
    if (err instanceof Error && err.message.includes("No reachable ComfyUI")) {
      return jsonError(err.message, 503);
    }
    return handleApiError(err);
  }
}
