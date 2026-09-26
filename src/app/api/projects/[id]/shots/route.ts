import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { nanoid, nowMs } from "@/lib/utils";
import {
  normalizeLegacyCharacterIds,
  syncShotCharacterCast,
  type ShotCharacterCastEntry,
} from "@/lib/services/shot-cast";
import { getShotsWithCast } from "@/lib/services/shot-list";
import { resolveSequenceId } from "@/lib/services/sequence-scope";
import { listShotsForSequence } from "@/lib/services/sequences";

interface CreateShotBody {
  title?: string;
  prompt?: string;
  locationId?: string | null;
  characterIds?: string[];
  characterCast?: ShotCharacterCastEntry[];
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

    const sequenceId = req.nextUrl.searchParams.get("sequenceId");
    const shots = getShotsWithCast(projectId, sequenceId);
    return jsonOk({ shots, sequenceId: resolveSequenceId(projectId, sequenceId) });
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
    const sequenceId = resolveSequenceId(projectId, body.sequenceId);

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

    const existing = listShotsForSequence(projectId, sequenceId);
    const sortOrder = existing.length;

    const id = nanoid();
    const ts = nowMs();
    const row = {
      id,
      projectId,
      sequenceId,
      sortOrder,
      title: body.title?.trim() ?? "",
      prompt: body.prompt?.trim() ?? "",
      renderOverridesJson: null,
      durationFrames: project.defaultDurationFrames,
      fps: null,
      locationId: body.locationId ?? null,
      locationStateId: null,
      locationAngleId: null,
      visualReferenceFocus: "location" as const,
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

    const shot = getShotsWithCast(projectId, sequenceId).find((s) => s.id === id)!;
    return jsonOk({ shot }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
