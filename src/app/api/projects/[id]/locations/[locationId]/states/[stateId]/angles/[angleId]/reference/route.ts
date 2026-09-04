import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
} from "@/lib/api-helpers";
import { MAX_UPLOAD_BYTES } from "@/lib/services/media-import";
import {
  applyLocationAngleReferenceMedia,
  clearLocationAngleReference,
} from "@/lib/services/sheet-reference-media";

type RouteParams = {
  params: Promise<{
    id: string;
    locationId: string;
    stateId: string;
    angleId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId, angleId } = await params;
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("file is required", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError(`File exceeds ${MAX_UPLOAD_BYTES} byte limit`, 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await applyLocationAngleReferenceMedia(
      projectId,
      locationId,
      stateId,
      angleId,
      buffer,
      file.name || "upload.png",
      "upload"
    );

    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof Error && err.message.endsWith("not found")) {
      return jsonError(err.message, 404);
    }
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, locationId, stateId, angleId } = await params;
    const angle = clearLocationAngleReference(
      projectId,
      locationId,
      stateId,
      angleId
    );
    return jsonOk({ angle });
  } catch (err) {
    if (err instanceof Error && err.message.endsWith("not found")) {
      return jsonError(err.message, 404);
    }
    return handleApiError(err);
  }
}
