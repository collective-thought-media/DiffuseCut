import type { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { nanoid, nowMs } from "@/lib/utils";
import { resolveSequenceId } from "@/lib/services/sequence-scope";

interface CreateAudioTrackBody {
  kind: "music" | "voiceover" | "sfx";
  label: string;
  filePath: string;
  startFrame?: number;
  durationFrames?: number | null;
  spanMode?: string;
  targetShotId?: string | null;
  promptText?: string | null;
  volume?: number;
  sequenceId?: string;
}

type RouteParams = { params: Promise<{ id: string }> };

function getProjectOrNull(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    if (!getProjectOrNull(projectId)) {
      return jsonError("Project not found", 404);
    }

    const sequenceId = resolveSequenceId(
      projectId,
      req.nextUrl.searchParams.get("sequenceId")
    );
    const db = getDb();
    const tracks = db
      .select()
      .from(schema.audioTracks)
      .where(
        and(
          eq(schema.audioTracks.projectId, projectId),
          eq(schema.audioTracks.sequenceId, sequenceId)
        )
      )
      .orderBy(asc(schema.audioTracks.createdAt))
      .all();

    return jsonOk({ tracks, sequenceId });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    if (!getProjectOrNull(projectId)) {
      return jsonError("Project not found", 404);
    }

    const body = await parseJson<CreateAudioTrackBody>(req);
    if (!body.kind) return jsonError("kind is required", 400);
    if (!body.label?.trim()) return jsonError("label is required", 400);
    if (!body.filePath?.trim()) return jsonError("filePath is required", 400);

    const validKinds = ["music", "voiceover", "sfx"];
    if (!validKinds.includes(body.kind)) {
      return jsonError("kind must be one of: music, voiceover, sfx", 400);
    }

    const sequenceId = resolveSequenceId(projectId, body.sequenceId);
    const id = nanoid();
    const ts = nowMs();
    const row = {
      id,
      projectId,
      sequenceId,
      kind: body.kind,
      label: body.label.trim(),
      filePath: body.filePath.trim(),
      startFrame: body.startFrame ?? 0,
      durationFrames: body.durationFrames ?? null,
      spanMode: body.spanMode ?? "full_timeline",
      targetShotId: body.targetShotId ?? null,
      promptText: body.promptText?.trim() || null,
      volume: body.volume ?? 1.0,
      createdAt: ts,
      updatedAt: ts,
    };

    const db = getDb();
    db.insert(schema.audioTracks).values(row).run();

    const track = db
      .select()
      .from(schema.audioTracks)
      .where(eq(schema.audioTracks.id, id))
      .get()!;

    return jsonOk({ track }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
