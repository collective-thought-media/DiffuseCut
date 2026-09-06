import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import {
  applyShotReferenceModePromptExtras,
  buildShotPlaceholderPrompts,
} from "@/lib/services/prompt-preprocess";
import { mergeImageNegativePrompt } from "@/lib/services/image-generation-overrides";
import { parseShotRenderOverrides } from "@/lib/shot-render-overrides";
import {
  resolveShotStillReferencePlan,
  type ShotStillReferenceMode,
} from "@/lib/services/shot-still-reference-mode";
import { parseVisualStyle } from "@/lib/services/visual-style";
import type { RenderSettings } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const title = req.nextUrl.searchParams.get("title")?.trim();
    const description = req.nextUrl.searchParams.get("description") ?? "";
    const projectId = req.nextUrl.searchParams.get("projectId")?.trim();
    const shotId = req.nextUrl.searchParams.get("shotId")?.trim();
    const hasLocationReference =
      req.nextUrl.searchParams.get("hasLocationReference") === "1";
    const hasCharacterReference =
      req.nextUrl.searchParams.get("hasCharacterReference") !== "0";
    const stillReferenceModeParam = req.nextUrl.searchParams.get(
      "stillReferenceMode"
    );
    const compositingPipelineAvailable =
      req.nextUrl.searchParams.get("compositingPipelineAvailable") === "1";

    if (!title) {
      return jsonError("title is required", 400);
    }

    let visualStyle = parseVisualStyle(undefined);
    let imageDefaultNegative: string | undefined;
    let stillNegativePrompt: string | undefined;
    let stillReferenceMode: ShotStillReferenceMode = "auto";
    let subjectScale: "small" | "medium" | "large" = "medium";

    if (projectId) {
      const db = getDb();
      const project = db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .get();
      if (!project) return jsonError("Project not found", 404);
      visualStyle = parseVisualStyle(project.visualStyleJson);
      const renderSettings = JSON.parse(
        project.renderSettingsJson || "{}"
      ) as RenderSettings;
      imageDefaultNegative = renderSettings.imageDefaultNegative;

      if (shotId) {
        const shot = db
          .select()
          .from(schema.shots)
          .where(eq(schema.shots.id, shotId))
          .get();
        if (shot) {
          const overrides = parseShotRenderOverrides(shot.renderOverridesJson);
          stillNegativePrompt = overrides.stillNegativePrompt;
          stillReferenceMode =
            (stillReferenceModeParam as ShotStillReferenceMode | null) ??
            overrides.stillReferenceMode ??
            "auto";
          subjectScale = overrides.subjectScale ?? "medium";
        }
      }
    }

    if (stillReferenceModeParam && !shotId) {
      stillReferenceMode = stillReferenceModeParam as ShotStillReferenceMode;
    }

    const referencePlan = resolveShotStillReferencePlan(
      {
        characterPath: hasCharacterReference ? "preview/character.png" : null,
        locationPath: hasLocationReference ? "preview/location.png" : null,
      },
      stillReferenceMode,
      { compositingPipelineAvailable }
    );

    const { processedPrompt, negativePrompt, usedLlm } =
      await buildShotPlaceholderPrompts(title, description, visualStyle, {
        hasLocationReference: referencePlan.hasLocationReferenceForPrompt,
      });

    const promptExtras = applyShotReferenceModePromptExtras(
      processedPrompt,
      negativePrompt,
      { ...referencePlan, subjectScale }
    );

    const mergedNegative = mergeImageNegativePrompt(
      promptExtras.negativePrompt,
      imageDefaultNegative,
      stillNegativePrompt
    );

    return jsonOk({
      processedPrompt: promptExtras.processedPrompt,
      negativePrompt: mergedNegative,
      usedLlm,
      visualStyle,
      effectiveReferenceMode: referencePlan.effectiveMode,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
