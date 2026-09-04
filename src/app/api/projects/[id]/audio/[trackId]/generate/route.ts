import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { resolveTrackTiming } from "@/lib/finishing/audio-track-timing";
import { totalProjectFrames } from "@/lib/timing/frames";
import { resolveProjectRoot } from "@/lib/paths/project-paths";
import { generateScoreAudioFile } from "@/lib/services/audio-score-generation";
import { generateSfxAudioFile } from "@/lib/services/sfx-audio-generation";
import { resolveSfxGenerationPrompt } from "@/lib/services/resolve-sfx-generation-prompt";
import { nowMs } from "@/lib/utils";

type RouteParams = {
  params: Promise<{ id: string; trackId: string }>;
};

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, trackId } = await params;
    const db = getDb();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) return jsonError("Project not found", 404);

    const track = db
      .select()
      .from(schema.audioTracks)
      .where(
        and(
          eq(schema.audioTracks.id, trackId),
          eq(schema.audioTracks.projectId, projectId)
        )
      )
      .get();
    if (!track) return jsonError("Audio track not found", 404);

    const shots = db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.projectId, projectId))
      .orderBy(asc(schema.shots.sortOrder))
      .all();

    const totalFrames = totalProjectFrames(shots);
    const fps = project.defaultFps ?? 24;
    const timing = resolveTrackTiming(track, shots, totalFrames);
    const durationSeconds = timing.durationFrames / fps;

    let resolvedSfx:
      | ReturnType<typeof resolveSfxGenerationPrompt>
      | null = null;
    if (track.kind === "sfx") {
      try {
        resolvedSfx = resolveSfxGenerationPrompt({ track, shots });
      } catch (err) {
        return jsonError(
          err instanceof Error ? err.message : "SFX prompt resolution failed.",
          400
        );
      }
    } else if (!track.promptText?.trim()) {
      return jsonError("Add a prompt before generating.", 400);
    }

    const projectRoot = resolveProjectRoot(project);
    const fileName = `${track.kind}-${trackId}-${Date.now()}.m4a`;
    const relativePath = path.join("audio", "tracks", fileName).replace(/\\/g, "/");
    const absolutePath = path.join(projectRoot, relativePath);

    const result =
      track.kind === "sfx" && resolvedSfx
        ? await generateSfxAudioFile({
            prompt: resolvedSfx.brief,
            modelPrompt: resolvedSfx.modelPrompt,
            strikeModelPrompt: resolvedSfx.strikeModelPrompt,
            bedModelPrompt: resolvedSfx.bedModelPrompt,
            durationSeconds,
            outputAbsolutePath: absolutePath,
          })
        : await generateScoreAudioFile({
            prompt: track.promptText!.trim(),
            durationSeconds,
            outputAbsolutePath: absolutePath,
            kind: track.kind === "voiceover" ? "voiceover" : "music",
          });

    const ts = nowMs();
    db.update(schema.audioTracks)
      .set({
        filePath: relativePath,
        durationFrames: timing.durationFrames,
        startFrame: timing.startFrame,
        ...(track.kind === "sfx" && resolvedSfx
          ? { promptText: resolvedSfx.brief }
          : {}),
        updatedAt: ts,
      })
      .where(eq(schema.audioTracks.id, trackId))
      .run();

    const updated = db
      .select()
      .from(schema.audioTracks)
      .where(eq(schema.audioTracks.id, trackId))
      .get()!;

    if (!fs.existsSync(absolutePath)) {
      return jsonError("Generated audio file missing on disk.", 500);
    }

    return jsonOk({
      track: updated,
      generation: {
        provider: result.provider,
        durationSeconds,
        sourceSeconds: result.sourceSeconds,
        modelPrompt:
          track.kind === "sfx" ? resolvedSfx?.modelPrompt : undefined,
        fromShot: track.kind === "sfx" ? resolvedSfx?.fromShot : undefined,
        aceStepPrompt:
          "aceStepPrompt" in result ? result.aceStepPrompt : undefined,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
