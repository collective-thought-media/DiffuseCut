import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { nowMs } from "@/lib/utils";
import { hydrateProjectRenderSettings, mergeRenderSettings } from "@/lib/services/render-settings-resolver";
import { normalizeRenderSettings } from "@/lib/services/image-sampler";
import { getDefaultRenderSettings, saveDefaultRenderSettings } from "@/lib/services/settings";
import type { RenderSettings } from "@/types";

interface PatchRenderSettingsBody {
  renderSettings?: RenderSettings;
  renderSettingsJson?: string;
}

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) return jsonError("Project not found", 404);

    const hydrate = req.nextUrl.searchParams.get("hydrate") === "1";
    const templateId = req.nextUrl.searchParams.get("templateId");

    if (hydrate) {
      let template = null;
      if (templateId) {
        template =
          db
            .select()
            .from(schema.workflowTemplates)
            .where(eq(schema.workflowTemplates.id, templateId))
            .get() ?? null;
      }

      const { renderSettings } = await hydrateProjectRenderSettings(projectId, {
        template,
        persist: true,
        updateAppDefaults: true,
      });

      return jsonOk({
        renderSettings,
        renderSettingsJson: JSON.stringify(renderSettings),
        hydrated: true,
      });
    }

    let renderSettings: RenderSettings = {};
    try {
      renderSettings = normalizeRenderSettings(
        JSON.parse(project.renderSettingsJson || "{}") as RenderSettings
      );
    } catch {
      renderSettings = {};
    }

    return jsonOk({
      renderSettings,
      renderSettingsJson: project.renderSettingsJson,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) return jsonError("Project not found", 404);

    const body = await parseJson<PatchRenderSettingsBody>(req);
    let renderSettingsJson: string;

    if (body.renderSettingsJson !== undefined) {
      JSON.parse(body.renderSettingsJson);
      renderSettingsJson = body.renderSettingsJson;
    } else if (body.renderSettings !== undefined) {
      renderSettingsJson = JSON.stringify(body.renderSettings);
    } else {
      return jsonError("renderSettings or renderSettingsJson is required", 400);
    }

    db.update(schema.projects)
      .set({ renderSettingsJson, updatedAt: nowMs() })
      .where(eq(schema.projects.id, projectId))
      .run();

    const renderSettings = normalizeRenderSettings(
      JSON.parse(renderSettingsJson) as RenderSettings
    );
    renderSettingsJson = JSON.stringify(renderSettings);
    const appDefaults = await getDefaultRenderSettings();
    await saveDefaultRenderSettings(
      mergeRenderSettings(appDefaults, renderSettings)
    );

    return jsonOk({ renderSettings, renderSettingsJson });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return jsonError("renderSettingsJson must be valid JSON", 400);
    }
    return handleApiError(err);
  }
}
