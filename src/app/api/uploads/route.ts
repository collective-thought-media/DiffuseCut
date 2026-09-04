import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
} from "@/lib/api-helpers";
import {
  applyEntityMedia,
  type EntityMediaType,
} from "@/lib/services/entity-media";
import { MAX_UPLOAD_BYTES } from "@/lib/services/media-import";

const ENTITY_TYPES: EntityMediaType[] = [
  "character",
  "location",
  "shot",
  "audio",
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const projectId = formData.get("projectId");
    const entityType = formData.get("entityType");
    const entityId = formData.get("entityId");
    const file = formData.get("file");

    if (typeof projectId !== "string" || !projectId) {
      return jsonError("projectId is required", 400);
    }
    if (typeof entityType !== "string" || !ENTITY_TYPES.includes(entityType as EntityMediaType)) {
      return jsonError(
        "entityType must be one of: character, location, shot, audio",
        400
      );
    }
    if (typeof entityId !== "string" || !entityId) {
      return jsonError("entityId is required", 400);
    }
    if (!(file instanceof File)) {
      return jsonError("file is required", 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError(`File exceeds ${MAX_UPLOAD_BYTES} byte limit`, 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || "upload";

    const result = await applyEntityMedia(
      projectId,
      entityType as EntityMediaType,
      entityId,
      buffer,
      fileName,
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
