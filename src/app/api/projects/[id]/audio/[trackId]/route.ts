import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { resolveProjectRoot } from "@/lib/paths/project-paths";
import { nowMs } from "@/lib/utils";

interface UpdateAudioTrackBody {
  kind?: "music" | "voiceover" | "sfx";
  label?: string;
  filePath?: string;
  startFrame?: number;
  durationFrames?: number | null;
  spanMode?: string;
  targetShotId?: string | null;
  promptText?: string | null;
  volume?: number;
}

type RouteParams = {
  params: Promise<{ id: string; trackId: string }>;
};

function getTrack(projectId: string, trackId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.audioTracks)
    .where(
      and(
        eq(schema.audioTracks.id, trackId),
        eq(schema.audioTracks.projectId, projectId)
      )
    )
    .get();
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, trackId } = await params;
    const existing = getTrack(projectId, trackId);
    if (!existing) return jsonError("Audio track not found", 404);

    const body = await parseJson<UpdateAudioTrackBody>(req);
    const db = getDb();
    const ts = nowMs();

    if (body.kind !== undefined) {
      const validKinds = ["music", "voiceover", "sfx"];
      if (!validKinds.includes(body.kind)) {
        return jsonError("kind must be one of: music, voiceover, sfx", 400);
      }
    }

    const updates: Partial<typeof existing> = { updatedAt: ts };
    if (body.kind !== undefined) updates.kind = body.kind;
    if (body.label !== undefined) updates.label = body.label.trim();
    if (body.filePath !== undefined) updates.filePath = body.filePath.trim();
    if (body.startFrame !== undefined) updates.startFrame = body.startFrame;
    if (body.durationFrames !== undefined) {
      updates.durationFrames = body.durationFrames;
    }
    if (body.spanMode !== undefined) updates.spanMode = body.spanMode;
    if (body.targetShotId !== undefined) {
      updates.targetShotId = body.targetShotId;
    }
    if (body.promptText !== undefined) {
      updates.promptText = body.promptText?.trim() || null;
    }
    if (body.volume !== undefined) updates.volume = body.volume;

    db.update(schema.audioTracks)
      .set(updates)
      .where(eq(schema.audioTracks.id, trackId))
      .run();

    const track = db
      .select()
      .from(schema.audioTracks)
      .where(eq(schema.audioTracks.id, trackId))
      .get()!;

    return jsonOk({ track });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, trackId } = await params;
    const existing = getTrack(projectId, trackId);
    if (!existing) return jsonError("Audio track not found", 404);

    const db = getDb();
    db.delete(schema.audioTracks)
      .where(eq(schema.audioTracks.id, trackId))
      .run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (project && existing.filePath) {
      const absolute = path.join(resolveProjectRoot(project), existing.filePath);
      if (fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
      }
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
