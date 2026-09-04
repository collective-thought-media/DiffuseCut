import type { NextRequest } from "next/server";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { fetchUrlToBuffer } from "@/lib/services/media-import";
import { applyCharacterStateReferenceMedia } from "@/lib/services/sheet-reference-media";

interface ImportUrlBody {
  url: string;
}

type RouteParams = {
  params: Promise<{
    id: string;
    characterId: string;
    stateId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, characterId, stateId } = await params;
    const body = await parseJson<ImportUrlBody>(req);

    if (!body.url?.trim()) {
      return jsonError("url is required", 400);
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
    const result = await applyCharacterStateReferenceMedia(
      projectId,
      characterId,
      stateId,
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
