import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { nanoid, nowMs } from "@/lib/utils";
import { syncShotCharacterCast } from "@/lib/services/shot-cast";
import {
  DEFAULT_CAMERA_A_PROMPT,
  DEFAULT_CAMERA_B_PROMPT,
  planInterviewMonologueSegments,
  type InterviewCameraPlan,
} from "@/lib/services/interview-monologue-planner";
import {
  parseShotRenderOverrides,
  serializeShotRenderOverrides,
} from "@/lib/shot-render-overrides";
import { totalTimelineFrames } from "@/lib/timing/frames";

export interface ApplyInterviewMonologuePlanOptions {
  projectId: string;
  characterId: string;
  locationId: string;
  cameraAStateId: string;
  cameraBStateId: string;
  cameraAAngleId?: string | null;
  cameraBAngleId?: string | null;
  cameraAStateLabel?: string;
  cameraBStateLabel?: string;
  cameraAPrompt?: string;
  cameraBPrompt?: string;
  cameraALocationStateId?: string | null;
  cameraALocationAngleId?: string | null;
  cameraBLocationStateId?: string | null;
  cameraBLocationAngleId?: string | null;
  defaultLocationStateId?: string | null;
  defaultLocationAngleId?: string | null;
  segmentDurationSec?: number;
  totalDurationFrames?: number;
  voiceoverTrackId?: string | null;
  firstCamera?: "A" | "B";
  replaceExistingShots?: boolean;
}

export interface ApplyInterviewMonologuePlanResult {
  shotsCreated: number;
  totalFrames: number;
  segmentCount: number;
  segmentDurationSec: number;
  voiceoverTrackId: string | null;
}

function getCharacterStateLabel(
  projectId: string,
  characterId: string,
  stateId: string
): string {
  const db = getDb();
  const state = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .get();
  if (!state || state.characterId !== characterId) {
    throw new Error(`Character state not found: ${stateId}`);
  }
  const character = db
    .select()
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.id, characterId),
        eq(schema.characters.projectId, projectId)
      )
    )
    .get();
  if (!character) throw new Error(`Character not found: ${characterId}`);
  return state.name.trim() || "Camera A";
}

export function applyInterviewMonologuePlan(
  options: ApplyInterviewMonologuePlanOptions
): ApplyInterviewMonologuePlanResult {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, options.projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const fps = project.defaultFps ?? 24;

  const location = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, options.locationId))
    .get();
  if (!location || location.projectId !== options.projectId) {
    throw new Error("Location not found");
  }

  const character = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, options.characterId))
    .get();
  if (!character || character.projectId !== options.projectId) {
    throw new Error("Character not found");
  }

  let totalFrames = options.totalDurationFrames ?? 0;
  let voiceoverTrackId = options.voiceoverTrackId ?? null;

  if (voiceoverTrackId) {
    const track = db
      .select()
      .from(schema.audioTracks)
      .where(
        and(
          eq(schema.audioTracks.id, voiceoverTrackId),
          eq(schema.audioTracks.projectId, options.projectId)
        )
      )
      .get();
    if (!track) throw new Error("Voiceover track not found");
    if (track.durationFrames && track.durationFrames > 0) {
      totalFrames = track.durationFrames;
    }
  }

  if (totalFrames < 1) {
    const fallbackTrack = db
      .select()
      .from(schema.audioTracks)
      .where(
        and(
          eq(schema.audioTracks.projectId, options.projectId),
          eq(schema.audioTracks.kind, "voiceover")
        )
      )
      .all()
      .find((t) => Boolean(t.filePath) && (t.durationFrames ?? 0) > 0);
    if (fallbackTrack) {
      voiceoverTrackId = fallbackTrack.id;
      totalFrames = fallbackTrack.durationFrames ?? 0;
    }
  }

  if (totalFrames < 1) {
    throw new Error(
      "Could not resolve monologue length. Add a voiceover track with duration or pass totalDurationFrames."
    );
  }

  const segmentDurationSec = options.segmentDurationSec ?? 6;
  const labelA =
    options.cameraAStateLabel ??
    getCharacterStateLabel(
      options.projectId,
      options.characterId,
      options.cameraAStateId
    );
  const labelB =
    options.cameraBStateLabel ??
    getCharacterStateLabel(
      options.projectId,
      options.characterId,
      options.cameraBStateId
    );

  const cameraA: InterviewCameraPlan = {
    label: labelA,
    characterStateId: options.cameraAStateId,
    characterAngleId: options.cameraAAngleId ?? null,
    prompt: options.cameraAPrompt?.trim() || DEFAULT_CAMERA_A_PROMPT,
    locationStateId:
      options.cameraALocationStateId ?? options.defaultLocationStateId ?? null,
    locationAngleId:
      options.cameraALocationAngleId ?? options.defaultLocationAngleId ?? null,
  };
  const cameraB: InterviewCameraPlan = {
    label: labelB,
    characterStateId: options.cameraBStateId,
    characterAngleId: options.cameraBAngleId ?? null,
    prompt: options.cameraBPrompt?.trim() || DEFAULT_CAMERA_B_PROMPT,
    locationStateId:
      options.cameraBLocationStateId ?? options.defaultLocationStateId ?? null,
    locationAngleId:
      options.cameraBLocationAngleId ?? options.defaultLocationAngleId ?? null,
  };

  const segments = planInterviewMonologueSegments({
    totalFrames,
    fps,
    segmentDurationSec,
    firstCameraIndex: options.firstCamera === "B" ? 1 : 0,
    cameraA,
    cameraB,
  });

  if (options.replaceExistingShots) {
    const existing = db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.projectId, options.projectId))
      .all();
    for (const shot of existing) {
      db.delete(schema.shots).where(eq(schema.shots.id, shot.id)).run();
    }
  }

  const overridesBase = serializeShotRenderOverrides({
    stillReferenceMode: "integrate_in_scene",
  });
  const ts = nowMs();
  let sortOrder = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.projectId, options.projectId))
    .all().length;

  for (const segment of segments) {
    const id = nanoid();
    const overridesJson = serializeShotRenderOverrides({
      ...parseShotRenderOverrides(overridesBase),
      ...(segment.camera.characterAngleId
        ? { characterAngleId: segment.camera.characterAngleId }
        : {}),
    });
    db.insert(schema.shots)
      .values({
        id,
        projectId: options.projectId,
        sortOrder,
        title: segment.title,
        prompt: segment.camera.prompt,
        renderOverridesJson: overridesJson,
        durationFrames: segment.durationFrames,
        fps: null,
        locationId: options.locationId,
        locationStateId: segment.camera.locationStateId ?? null,
        locationAngleId: segment.camera.locationAngleId ?? null,
        placeholderPath: null,
        placeholderKind: null,
        videoPath: null,
        trimInFrames: 0,
        trimOutFrames: null,
        renderStatus: "pending",
        renderJobId: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    syncShotCharacterCast(id, options.projectId, [
      {
        characterId: options.characterId,
        characterStateId: segment.camera.characterStateId,
      },
    ]);
    sortOrder += 1;
  }

  const createdShots = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.projectId, options.projectId))
    .orderBy(asc(schema.shots.sortOrder))
    .all();
  const timelineFrames = totalTimelineFrames(createdShots);

  if (voiceoverTrackId) {
    db.update(schema.audioTracks)
      .set({
        durationFrames: timelineFrames,
        startFrame: 0,
        spanMode: "full_timeline",
        updatedAt: ts,
      })
      .where(eq(schema.audioTracks.id, voiceoverTrackId))
      .run();
  }

  return {
    shotsCreated: segments.length,
    totalFrames: timelineFrames,
    segmentCount: segments.length,
    segmentDurationSec,
    voiceoverTrackId,
  };
}
