import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { suggestSfxForShots } from "@/lib/services/shot-sfx-suggest";
import { isSfxGenerationConfigured } from "@/lib/services/sfx-audio-generation";
import { resolveComfyWooshEndpoint } from "@/lib/services/comfy-woosh-generation";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const db = getDb();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) return jsonError("Project not found", 404);

    const shots = db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.projectId, projectId))
      .orderBy(asc(schema.shots.sortOrder))
      .all();

    if (shots.length === 0) {
      return jsonError("Add storyboard shots before suggesting sound effects.", 400);
    }

    const suggestions = await suggestSfxForShots(shots);
    const usedLlm = suggestions.some((row) => row.usedLlm);
    const wooshUrl = await resolveComfyWooshEndpoint();
    const sfxReady = await isSfxGenerationConfigured();

    return jsonOk({
      suggestions,
      usedLlm,
      shotCount: shots.length,
      sfxGenerator: {
        ready: sfxReady,
        provider: wooshUrl ? "woosh_comfy" : "elevenlabs_or_none",
        wooshUrl,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
