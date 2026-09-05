import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { totalTimelineFrames } from "@/lib/timing/frames";
import {
  createSfxTracksForShots,
  generateSfxTrackAudio,
  listProjectSfxTracks,
} from "@/lib/services/shot-sfx-batch";

type RouteParams = { params: Promise<{ id: string }> };

interface BatchBody {
  suggestions?: Array<{ shotId: string; promptText: string; label?: string }>;
  replaceExisting?: boolean;
  generate?: boolean;
  trackIds?: string[];
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const body = await parseJson<BatchBody>(req);
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
      return jsonError("Add storyboard shots before building sound effects.", 400);
    }

    const fps = project.defaultFps ?? 24;
    const totalFrames = totalTimelineFrames(shots);

    let tracks = listProjectSfxTracks(projectId);

    if (body.suggestions?.length) {
      const valid = body.suggestions.filter(
        (row) =>
          row.shotId &&
          row.promptText?.trim() &&
          shots.some((shot) => shot.id === row.shotId)
      );
      if (valid.length === 0) {
        return jsonError("No valid SFX suggestions were provided.", 400);
      }

      tracks = createSfxTracksForShots({
        project,
        shots,
        suggestions: valid,
        totalFrames,
        replaceExisting: body.replaceExisting ?? true,
      });
    }

    if (body.generate) {
      const targetIds =
        body.trackIds && body.trackIds.length > 0
          ? body.trackIds
          : tracks.map((track) => track.id);

      const generated = [];
      const errors: Array<{ trackId: string; error: string }> = [];

      for (const trackId of targetIds) {
        const track = db
          .select()
          .from(schema.audioTracks)
          .where(eq(schema.audioTracks.id, trackId))
          .get();
        if (!track || track.kind !== "sfx") continue;

        try {
          const updated = await generateSfxTrackAudio({
            project,
            track,
            shots,
            fps,
          });
          generated.push(updated);
        } catch (err) {
          errors.push({
            trackId,
            error: err instanceof Error ? err.message : "Generation failed",
          });
        }
      }

      return jsonOk({
        tracks: listProjectSfxTracks(projectId),
        generated,
        errors,
      });
    }

    return jsonOk({ tracks });
  } catch (err) {
    return handleApiError(err);
  }
}
