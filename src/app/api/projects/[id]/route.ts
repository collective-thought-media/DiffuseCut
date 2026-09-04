import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { writeProjectMeta } from "@/lib/paths/project-paths";
import { deleteProject } from "@/lib/services/file-manager";
import { serializeVisualStyle } from "@/lib/services/visual-style";
import type { VisualStyle } from "@/lib/services/visual-style";
import { VISUAL_STYLE_PRESETS } from "@/lib/services/visual-style";
import { nowMs } from "@/lib/utils";

interface UpdateProjectBody {
  name?: string;
  logline?: string;
  plot?: string;
  defaultFps?: number;
  comfyuiEndpointsJson?: string | null;
  visualStyle?: VisualStyle;
}

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!project) return jsonError("Project not found", 404);
    return jsonOk({ project });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await parseJson<UpdateProjectBody>(req);
    const db = getDb();

    const existing = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
    if (!existing) return jsonError("Project not found", 404);

    if (body.comfyuiEndpointsJson !== undefined && body.comfyuiEndpointsJson !== null) {
      JSON.parse(body.comfyuiEndpointsJson);
    }

    const updates: Partial<typeof existing> = { updatedAt: nowMs() };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.logline !== undefined) updates.logline = body.logline;
    if (body.plot !== undefined) updates.plot = body.plot;
    if (body.defaultFps !== undefined) updates.defaultFps = body.defaultFps;
    if (body.comfyuiEndpointsJson !== undefined) {
      updates.comfyuiEndpointsJson = body.comfyuiEndpointsJson;
    }
    if (body.visualStyle !== undefined) {
      if (
        !body.visualStyle.preset ||
        !(body.visualStyle.preset in VISUAL_STYLE_PRESETS)
      ) {
        return jsonError("Invalid visual style preset", 400);
      }
      updates.visualStyleJson = serializeVisualStyle(body.visualStyle);
    }

    db.update(schema.projects)
      .set(updates)
      .where(eq(schema.projects.id, id))
      .run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get()!;

    writeProjectMeta(project);
    return jsonOk({ project });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return jsonError("comfyuiEndpointsJson must be valid JSON", 400);
    }
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleteMedia = req.nextUrl.searchParams.get("deleteMedia") !== "false";
    const result = await deleteProject(id, { deleteMedia });
    if (!result.ok) return jsonError("Project not found", 404);
    return jsonOk({
      ok: true,
      deleteMedia,
      keptMediaPath: deleteMedia ? undefined : result.projectRoot,
      mediaDeleted: result.mediaDeleted,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
