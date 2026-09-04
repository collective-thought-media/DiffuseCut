import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import {
  applyEntityMedia,
  type EntityMediaType,
} from "@/lib/services/entity-media";
import { fetchUrlToBuffer } from "@/lib/services/media-import";

interface ImportUrlBody {
  url: string;
  projectId: string;
  entityType: EntityMediaType;
  entityId: string;
}

const ENTITY_TYPES: EntityMediaType[] = [
  "character",
  "location",
  "shot",
  "audio",
];

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson<ImportUrlBody>(req);

    if (!body.url?.trim()) {
      return jsonError("url is required", 400);
    }
    if (!body.projectId) {
      return jsonError("projectId is required", 400);
    }
    if (!ENTITY_TYPES.includes(body.entityType)) {
      return jsonError(
        "entityType must be one of: character, location, shot, audio",
        400
      );
    }
    if (!body.entityId) {
      return jsonError("entityId is required", 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(body.url);
    } catch {
      return jsonError("url must be a valid URL", 400);
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return jsonError("url must use http or https", 400);
    }

    const { buffer, fileName } = await fetchUrlToBuffer(body.url);

    const result = await applyEntityMedia(
      body.projectId,
      body.entityType,
      body.entityId,
      buffer,
      fileName,
      "url"
    );

    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof Error && err.message.endsWith("not found")) {
      return jsonError(err.message, 404);
    }
    return handleApiError(err);
  }
}
