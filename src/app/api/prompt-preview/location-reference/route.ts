import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { buildLocationReferencePrompts } from "@/lib/services/prompt-preprocess";
import { mergeImageNegativePrompt } from "@/lib/services/image-generation-overrides";
import { parseVisualStyle } from "@/lib/services/visual-style";

export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name")?.trim();
    const description = req.nextUrl.searchParams.get("description") ?? "";
    const projectId = req.nextUrl.searchParams.get("projectId")?.trim();

    if (!name) {
      return jsonError("name is required", 400);
    }

    let visualStyle = parseVisualStyle(undefined);
    if (projectId) {
      const db = getDb();
      const project = db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .get();
      if (!project) return jsonError("Project not found", 404);
      visualStyle = parseVisualStyle(project.visualStyleJson);
    }

    const anchorMode = req.nextUrl.searchParams.get("anchorMode") === "true";
    const extraNegativePrompt =
      req.nextUrl.searchParams.get("extraNegativePrompt")?.trim() || undefined;

    const { processedPrompt, negativePrompt, usedLlm } =
      await buildLocationReferencePrompts(name, description, visualStyle, {
        anchorMode,
      });

    const negativeWithExtra = mergeImageNegativePrompt(
      negativePrompt,
      extraNegativePrompt
    );

    return jsonOk({
      processedPrompt,
      negativePrompt: negativeWithExtra,
      usedLlm,
      visualStyle,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
