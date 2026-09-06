import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleApiError, parseJson } from "@/lib/api-helpers";
import { punchInLocationAngleFromAnchor } from "@/lib/services/location-asset-generation";
import type { PunchInFocus } from "@/lib/services/image-punch-in";

type RouteParams = {
  params: Promise<{
    id: string;
    locationId: string;
    stateId: string;
    angleId: string;
  }>;
};

interface PunchInBody {
  zoom?: number;
  focus?: PunchInFocus;
}

const FOCUS_VALUES = new Set<PunchInFocus>([
  "center",
  "left",
  "right",
  "upper_center",
  "lower_center",
]);

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId, angleId } = await params;
    const body = await parseJson<PunchInBody>(req);
    const zoom = typeof body.zoom === "number" ? body.zoom : 1.75;
    const focus = body.focus && FOCUS_VALUES.has(body.focus) ? body.focus : "center";

    const result = await punchInLocationAngleFromAnchor(
      projectId,
      locationId,
      stateId,
      angleId,
      { zoom, focus }
    );

    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.endsWith("not found")) {
        return jsonError(err.message, 404);
      }
      if (
        err.message.includes("establishing") ||
        err.message.includes("missing on disk") ||
        err.message.includes("too small") ||
        err.message.includes("dimensions")
      ) {
        return jsonError(err.message, 400);
      }
    }
    return handleApiError(err);
  }
}
