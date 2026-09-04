import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { buildShotPlaceholderPrompts } from "@/lib/services/prompt-preprocess";
import { parseVisualStyle } from "@/lib/services/visual-style";

export async function GET(req: NextRequest) {
  try {
    const title = req.nextUrl.searchParams.get("title")?.trim();
    const description = req.nextUrl.searchParams.get("description") ?? "";
    const projectId = req.nextUrl.searchParams.get("projectId")?.trim();

    if (!title) {
      return jsonError("title is required", 400);
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

    const { processedPrompt, negativePrompt, usedLlm } =
      await buildShotPlaceholderPrompts(title, description, visualStyle);

    return jsonOk({ processedPrompt, negativePrompt, usedLlm, visualStyle });
  } catch (err) {
    return handleApiError(err);
  }
}
