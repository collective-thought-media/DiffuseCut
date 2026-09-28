import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { applyInterviewMonologuePlan } from "@/lib/services/apply-interview-monologue-plan";

interface PlanInterviewMonologueBody {
  characterId: string;
  locationId: string;
  cameraAStateId: string;
  cameraBStateId: string;
  cameraAAngleId?: string | null;
  cameraBAngleId?: string | null;
  cameraAPrompt?: string;
  cameraBPrompt?: string;
  cameraALocationStateId?: string | null;
  cameraALocationAngleId?: string | null;
  cameraBLocationStateId?: string | null;
  cameraBLocationAngleId?: string | null;
  defaultLocationStateId?: string | null;
  defaultLocationAngleId?: string | null;
  segmentDurationSec?: number;
  totalDurationFrames?: number;
  voiceoverTrackId?: string | null;
  firstCamera?: "A" | "B";
  replaceExistingShots?: boolean;
}

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const body = await parseJson<PlanInterviewMonologueBody>(req);

    if (!body.characterId?.trim()) {
      return jsonError("characterId is required", 400);
    }
    if (!body.locationId?.trim()) {
      return jsonError("locationId is required", 400);
    }
    if (!body.cameraAStateId?.trim()) {
      return jsonError("cameraAStateId is required", 400);
    }
    if (!body.cameraBStateId?.trim()) {
      return jsonError("cameraBStateId is required", 400);
    }
    if (body.cameraAStateId === body.cameraBStateId) {
      const sameStateDifferentAngles =
        body.cameraAAngleId &&
        body.cameraBAngleId &&
        body.cameraAAngleId !== body.cameraBAngleId;
      if (!sameStateDifferentAngles) {
        return jsonError(
          "cameraAStateId and cameraBStateId must differ, or pass two different cameraAAngleId and cameraBAngleId on the same state",
          400
        );
      }
    }

    const result = applyInterviewMonologuePlan({
      projectId,
      characterId: body.characterId.trim(),
      locationId: body.locationId.trim(),
      cameraAStateId: body.cameraAStateId.trim(),
      cameraBStateId: body.cameraBStateId.trim(),
      cameraAAngleId: body.cameraAAngleId,
      cameraBAngleId: body.cameraBAngleId,
      cameraAPrompt: body.cameraAPrompt,
      cameraBPrompt: body.cameraBPrompt,
      cameraALocationStateId: body.cameraALocationStateId,
      cameraALocationAngleId: body.cameraALocationAngleId,
      cameraBLocationStateId: body.cameraBLocationStateId,
      cameraBLocationAngleId: body.cameraBLocationAngleId,
      defaultLocationStateId: body.defaultLocationStateId,
      defaultLocationAngleId: body.defaultLocationAngleId,
      segmentDurationSec: body.segmentDurationSec,
      totalDurationFrames: body.totalDurationFrames,
      voiceoverTrackId: body.voiceoverTrackId,
      firstCamera: body.firstCamera,
      replaceExistingShots: body.replaceExistingShots ?? false,
    });

    return jsonOk({ plan: result });
  } catch (err) {
    return handleApiError(err);
  }
}
