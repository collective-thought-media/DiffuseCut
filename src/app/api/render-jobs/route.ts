import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { assertDependency } from "@/lib/services/dependency-checker";
import {
  enqueueRenderJobs,
  getJobsForProject,
} from "@/lib/services/render-queue";

interface CreateRenderJobsBody {
  projectId: string;
  shotIds: string[];
  workflowTemplateId: string;
}

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return jsonError("projectId is required", 400);

    const jobs = getJobsForProject(projectId);
    return jsonOk({ jobs });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await assertDependency("comfyui");

    const body = await parseJson<CreateRenderJobsBody>(req);
    if (!body.projectId) return jsonError("projectId is required", 400);
    if (!Array.isArray(body.shotIds) || body.shotIds.length === 0) {
      return jsonError("shotIds must be a non-empty array", 400);
    }
    if (!body.workflowTemplateId) {
      return jsonError("workflowTemplateId is required", 400);
    }

    const jobs = await enqueueRenderJobs(
      body.projectId,
      body.shotIds,
      body.workflowTemplateId
    );

    return jsonOk({ jobs }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Configure render settings")) {
      return jsonError(err.message, 400);
    }
    if (err instanceof Error && err.message.includes("No reachable ComfyUI")) {
      return jsonError(err.message, 503);
    }
    if (err instanceof Error && err.message.includes("not found")) {
      return jsonError(err.message, 404);
    }
    return handleApiError(err);
  }
}
