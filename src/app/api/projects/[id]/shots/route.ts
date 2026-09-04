import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { nanoid, nowMs } from "@/lib/utils";
import {
  getShotCharacterCast,
  normalizeLegacyCharacterIds,
  syncShotCharacterCast,
  type ShotCharacterCastEntry,
} from "@/lib/services/shot-cast";

interface CreateShotBody {
  title?: string;
  prompt?: string;
  locationId?: string | null;
  characterIds?: string[];
  characterCast?: ShotCharacterCastEntry[];
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

function getShotsWithCast(projectId: string) {
  const db = getDb();
  const shots = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.projectId, projectId))
    .orderBy(asc(schema.shots.sortOrder), asc(schema.shots.createdAt))
    .all();

  return shots.map((shot) => {
    const characterCast = getShotCharacterCast(shot.id);
    return {
      ...shot,
      characterCast,
      characterIds: characterCast.map((entry) => entry.characterId),
    };
  });
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    if (!getProjectOrNull(projectId)) {
      return jsonError("Project not found", 404);
    }

    const shots = getShotsWithCast(projectId);
    return jsonOk({ shots });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const project = getProjectOrNull(projectId);
    if (!project) return jsonError("Project not found", 404);

    const body = await parseJson<CreateShotBody>(req);
    const db = getDb();

    if (body.locationId) {
      const location = db
        .select()
        .from(schema.locations)
        .where(eq(schema.locations.id, body.locationId))
        .get();
      if (!location || location.projectId !== projectId) {
        return jsonError("Location not found", 404);
      }
    }

    const existing = db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.projectId, projectId))
      .all();
    const sortOrder = existing.length;

    const id = nanoid();
    const ts = nowMs();
    const row = {
      id,
      projectId,
      sortOrder,
      title: body.title?.trim() ?? "",
      prompt: body.prompt?.trim() ?? "",
      renderOverridesJson: null,
      durationFrames: project.defaultDurationFrames,
      fps: null,
      locationId: body.locationId ?? null,
      placeholderPath: null,
      placeholderKind: null,
      videoPath: null,
      trimInFrames: 0,
      trimOutFrames: null,
      renderStatus: "pending" as const,
      renderJobId: null,
      createdAt: ts,
      updatedAt: ts,
    };

    db.insert(schema.shots).values(row).run();

    if (body.characterCast?.length) {
      syncShotCharacterCast(id, projectId, body.characterCast);
    } else if (body.characterIds?.length) {
      syncShotCharacterCast(
        id,
        projectId,
        normalizeLegacyCharacterIds(projectId, body.characterIds)
      );
    }

    const shot = getShotsWithCast(projectId).find((s) => s.id === id)!;
    return jsonOk({ shot }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
