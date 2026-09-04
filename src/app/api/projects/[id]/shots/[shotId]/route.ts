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
import {
  getShotCharacterCast,
  normalizeLegacyCharacterIds,
  syncShotCharacterCast,
  type ShotCharacterCastEntry,
} from "@/lib/services/shot-cast";
import { getLocationAngle, getLocationState } from "@/lib/services/location-states";

interface UpdateShotBody {
  title?: string;
  prompt?: string;
  durationFrames?: number;
  locationId?: string | null;
  locationStateId?: string | null;
  locationAngleId?: string | null;
  visualReferenceFocus?: "location" | "character";
  characterIds?: string[];
  characterCast?: ShotCharacterCastEntry[];
  trimInFrames?: number;
  trimOutFrames?: number | null;
  renderOverridesJson?: string | null;
}

type RouteParams = {
  params: Promise<{ id: string; shotId: string }>;
};

function getShotWithCast(projectId: string, shotId: string) {
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(
      and(
        eq(schema.shots.id, shotId),
        eq(schema.shots.projectId, projectId)
      )
    )
    .get();

  if (!shot) return null;

  const characterCast = getShotCharacterCast(shotId);
  return {
    ...shot,
    characterCast,
    characterIds: characterCast.map((entry) => entry.characterId),
  };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const shot = getShotWithCast(projectId, shotId);
    if (!shot) return jsonError("Shot not found", 404);
    return jsonOk({ shot });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const existing = getShotWithCast(projectId, shotId);
    if (!existing) return jsonError("Shot not found", 404);

    const body = await parseJson<UpdateShotBody>(req);
    const db = getDb();
    const ts = nowMs();

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

    const nextLocationId =
      body.locationId !== undefined ? body.locationId : existing.locationId;

    if (body.locationStateId) {
      if (!nextLocationId) {
        return jsonError("locationStateId requires a location", 400);
      }
      const state = getLocationState(
        projectId,
        nextLocationId,
        body.locationStateId
      );
      if (!state) return jsonError("Location state not found", 404);
    }

    if (body.locationAngleId) {
      if (!nextLocationId) {
        return jsonError("locationAngleId requires a location", 400);
      }
      const stateId =
        body.locationStateId ?? existing.locationStateId ?? undefined;
      if (!stateId) {
        return jsonError("locationAngleId requires a location state", 400);
      }
      const angle = getLocationAngle(
        projectId,
        nextLocationId,
        stateId,
        body.locationAngleId
      );
      if (!angle) return jsonError("Location angle not found", 404);
    }

    if (
      body.visualReferenceFocus !== undefined &&
      body.visualReferenceFocus !== "location" &&
      body.visualReferenceFocus !== "character"
    ) {
      return jsonError("visualReferenceFocus must be location or character", 400);
    }

    if (body.renderOverridesJson !== undefined && body.renderOverridesJson !== null) {
      JSON.parse(body.renderOverridesJson);
    }

    const updates: Partial<typeof schema.shots.$inferInsert> = { updatedAt: ts };
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.prompt !== undefined) updates.prompt = body.prompt;
    if (body.durationFrames !== undefined) {
      updates.durationFrames = body.durationFrames;
    }
    if (body.locationId !== undefined) {
      updates.locationId = body.locationId;
      if (body.locationId === null) {
        updates.locationStateId = null;
        updates.locationAngleId = null;
      }
    }
    if (body.locationStateId !== undefined) {
      updates.locationStateId = body.locationStateId;
    }
    if (body.locationAngleId !== undefined) {
      updates.locationAngleId = body.locationAngleId;
    }
    if (body.visualReferenceFocus !== undefined) {
      updates.visualReferenceFocus = body.visualReferenceFocus;
    }
    if (body.trimInFrames !== undefined) updates.trimInFrames = body.trimInFrames;
    if (body.trimOutFrames !== undefined) updates.trimOutFrames = body.trimOutFrames;
    if (body.renderOverridesJson !== undefined) {
      updates.renderOverridesJson = body.renderOverridesJson;
    }

    db.update(schema.shots)
      .set(updates)
      .where(eq(schema.shots.id, shotId))
      .run();

    if (body.characterCast !== undefined) {
      syncShotCharacterCast(shotId, projectId, body.characterCast);
    } else if (body.characterIds !== undefined) {
      syncShotCharacterCast(
        shotId,
        projectId,
        normalizeLegacyCharacterIds(projectId, body.characterIds)
      );
    }

    const shot = getShotWithCast(projectId, shotId)!;
    return jsonOk({ shot });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return jsonError("renderOverridesJson must be valid JSON", 400);
    }
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, shotId } = await params;
    const existing = getShotWithCast(projectId, shotId);
    if (!existing) return jsonError("Shot not found", 404);

    const db = getDb();
    db.delete(schema.shots).where(eq(schema.shots.id, shotId)).run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (project) {
      const shotDir = path.join(
        resolveProjectRoot(project),
        "storyboard",
        "shots",
        shotId
      );
      if (fs.existsSync(shotDir)) {
        fs.rmSync(shotDir, { recursive: true, force: true });
      }
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
