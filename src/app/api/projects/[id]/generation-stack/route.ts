import type { NextRequest } from "next/server";
import { jsonOk, handleApiError } from "@/lib/api-helpers";
import { getGenerationStack } from "@/lib/services/generation-stack";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const stack = await getGenerationStack(projectId);
    return jsonOk({ stack });
  } catch (err) {
    return handleApiError(err);
  }
}
