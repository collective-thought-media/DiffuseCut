import fs from "fs";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import {
  resolveMediaPath,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import {
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";
import { listEndpoints, uploadMedia } from "@/lib/services/comfyui-client";

interface SendBody {
  optionId?: string;
}

type RouteParams = {
  params: Promise<{ id: string; shotId: string }>;
};

/**
 * Copy a finished candidate image into the ComfyUI input folder so the user
 * can pick it up in a LoadImage node for their own workflow. The saved PNG on
 * disk also embeds the full generating workflow; dragging that file into the
 * ComfyUI browser tab reconstructs the graph.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const body = await parseJson<SendBody>(req);
    if (!body.optionId) {
      return jsonError("optionId is required", 400);
    }

    const db = getDb();
    const option = db
      .select()
      .from(schema.assetGenerationOptions)
      .where(eq(schema.assetGenerationOptions.id, body.optionId))
      .get();
    if (!option || option.status !== "completed" || !option.outputPath) {
      return jsonError("Image is not ready to send", 400);
    }

    const batch = db
      .select()
      .from(schema.assetGenerationBatches)
      .where(eq(schema.assetGenerationBatches.id, option.batchId))
      .get();
    if (
      !batch ||
      batch.projectId !== projectId ||
      batch.entityType !== "shot" ||
      batch.entityId !== shotId
    ) {
      return jsonError("Image does not belong to this shot", 400);
    }

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) return jsonError("Project not found", 404);

    const projectRoot = resolveProjectRoot(project);
    const sourceAbs = resolveMediaPath(projectRoot, option.outputPath);
    if (!fs.existsSync(sourceAbs)) {
      return jsonError("Image file missing on disk", 400);
    }

    const appEndpoints = await getDefaultComfyuiEndpoints();
    const endpoints = resolveComfyuiEndpoints(
      project.comfyuiEndpointsJson,
      appEndpoints
    );
    const endpointUrl = await listEndpoints(endpoints);
    if (!endpointUrl) {
      return jsonError("No reachable ComfyUI endpoint configured", 502);
    }

    const uploadFileName = `DiffuseCutSend-${option.id}.png`;
    const uploaded = await uploadMedia(endpointUrl, sourceAbs, {
      kind: "image",
      overwrite: true,
      uploadFileName,
    });

    return jsonOk({
      endpointUrl,
      filename: uploaded.name,
      subfolder: uploaded.subfolder,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
