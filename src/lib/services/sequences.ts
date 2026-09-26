import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Sequence, Shot } from "@/lib/db/schema";
import {
  createEmptyTimelineState,
  parseTimelineState,
  serializeTimelineState,
} from "@/lib/timeline/defaults";
import type { TimelineClip, TimelineState } from "@/lib/timeline/types";
import {
  embeddedAudioSyncFingerprint,
  syncEmbeddedAudioLanes,
} from "@/lib/timeline/embedded-audio-sync";
import { getShotCharacterCast, syncShotCharacterCast } from "@/lib/services/shot-cast";
import { nanoid, nowMs } from "@/lib/utils";
import {
  getDefaultSequenceId,
  listSequencesForProject,
  sequenceBelongsToProject,
} from "@/lib/services/sequence-scope";
import {
  buildTimelineFromSequence,
  buildTimelineFromShots,
  mergeFinishingAudioIntoTimeline,
  reconcilePrimaryVideoTrackWithShots,
  refreshShotClipMediaFromShots,
  relocateFinishingAudioOffA1,
  timelineAudioTracksAreEmpty,
  timelineVideoTrackIsEmpty,
} from "@/lib/services/timeline-sync";

export { listSequencesForProject } from "@/lib/services/sequence-scope";

export function getSequence(projectId: string, sequenceId: string) {
  if (!sequenceBelongsToProject(projectId, sequenceId)) return null;
  const db = getDb();
  return db
    .select()
    .from(schema.sequences)
    .where(eq(schema.sequences.id, sequenceId))
    .get() ?? null;
}

export function createDefaultSequenceForProject(
  projectId: string,
  fps = 24,
  name = "Storyboard"
): Sequence {
  const db = getDb();
  const existing = listSequencesForProject(projectId);
  const sortOrder = existing.length;
  const ts = nowMs();
  const id = nanoid();
  const row = {
    id,
    projectId,
    name,
    sortOrder,
    timelineJson: serializeTimelineState(createEmptyTimelineState(fps)),
    createdAt: ts,
    updatedAt: ts,
  };
  db.insert(schema.sequences).values(row).run();
  return db.select().from(schema.sequences).where(eq(schema.sequences.id, id)).get()!;
}

export function createSequence(projectId: string, name: string, fps = 24) {
  return createDefaultSequenceForProject(projectId, fps, name.trim() || "New sequence");
}

export function renameSequence(
  projectId: string,
  sequenceId: string,
  name: string
) {
  const db = getDb();
  if (!sequenceBelongsToProject(projectId, sequenceId)) return null;
  const ts = nowMs();
  db.update(schema.sequences)
    .set({ name: name.trim(), updatedAt: ts })
    .where(eq(schema.sequences.id, sequenceId))
    .run();
  return getSequence(projectId, sequenceId);
}

export function deleteSequence(projectId: string, sequenceId: string) {
  const db = getDb();
  const all = listSequencesForProject(projectId);
  if (all.length <= 1) {
    throw new Error("Cannot delete the last sequence in a project");
  }
  if (!sequenceBelongsToProject(projectId, sequenceId)) {
    throw new Error("Sequence not found");
  }
  db.delete(schema.sequences)
    .where(eq(schema.sequences.id, sequenceId))
    .run();
  return { ok: true as const };
}

export function listShotsForSequence(
  projectId: string,
  sequenceId: string
): Shot[] {
  const db = getDb();
  if (!sequenceBelongsToProject(projectId, sequenceId)) return [];
  return db
    .select()
    .from(schema.shots)
    .where(
      and(
        eq(schema.shots.projectId, projectId),
        eq(schema.shots.sequenceId, sequenceId)
      )
    )
    .orderBy(asc(schema.shots.sortOrder), asc(schema.shots.createdAt))
    .all();
}

export function getTimelineState(
  projectId: string,
  sequenceId: string,
  options?: { syncFromStoryboardIfEmpty?: boolean; fps?: number }
): TimelineState | null {
  const seq = getSequence(projectId, sequenceId);
  if (!seq) return null;
  let state = parseTimelineState(seq.timelineJson);

  if (options?.syncFromStoryboardIfEmpty) {
    const fps = options.fps ?? state.fps ?? 24;
    const needsVideo = timelineVideoTrackIsEmpty(state);
    const needsAudio = timelineAudioTracksAreEmpty(state);
    if (needsVideo || needsAudio) {
      const built = buildTimelineFromSequence(projectId, sequenceId, fps, state);
      const hasClips =
        (built.videoTracks[0]?.clips.length ?? 0) > 0 ||
        built.audioTracks.some((t) => t.clips.length > 0);
      if (hasClips) {
        state = saveTimelineState(projectId, sequenceId, built);
      }
    }
  }

  const fps = state.fps ?? 24;
  const shots = listShotsForSequence(projectId, sequenceId);
  let normalized = reconcilePrimaryVideoTrackWithShots(projectId, state, shots);
  normalized = refreshShotClipMediaFromShots(projectId, normalized, shots);
  normalized = mergeFinishingAudioIntoTimeline(
    projectId,
    sequenceId,
    fps,
    normalized,
    shots
  );
  normalized = relocateFinishingAudioOffA1(normalized);
  const synced = syncEmbeddedAudioLanes(normalized);
  if (
    serializeTimelineState(synced) !== serializeTimelineState(state) ||
    embeddedAudioSyncFingerprint(synced) !==
      embeddedAudioSyncFingerprint(state)
  ) {
    return saveTimelineState(projectId, sequenceId, synced);
  }
  return synced;
}

export function saveTimelineState(
  projectId: string,
  sequenceId: string,
  state: TimelineState
) {
  if (!sequenceBelongsToProject(projectId, sequenceId)) {
    throw new Error("Sequence not found");
  }
  const relocated = relocateFinishingAudioOffA1(state);
  const synced = syncEmbeddedAudioLanes(relocated);
  const db = getDb();
  db.update(schema.sequences)
    .set({
      timelineJson: serializeTimelineState(synced),
      updatedAt: nowMs(),
    })
    .where(eq(schema.sequences.id, sequenceId))
    .run();
  return synced;
}

function remapTimelineShotRefs(
  timeline: TimelineState,
  shotIdMap: Map<string, string>
): TimelineState {
  const remapClip = (clip: TimelineClip): TimelineClip => {
    if (clip.sourceType !== "shot") return clip;
    const nextRef = shotIdMap.get(clip.sourceRef);
    return nextRef ? { ...clip, sourceRef: nextRef } : clip;
  };
  return {
    ...timeline,
    videoTracks: timeline.videoTracks.map((track) => ({
      ...track,
      clips: track.clips.map(remapClip),
    })),
    audioTracks: timeline.audioTracks.map((track) => ({
      ...track,
      clips: track.clips.map(remapClip),
    })),
  };
}

export function duplicateSequence(
  projectId: string,
  sourceSequenceId: string,
  name?: string
) {
  const db = getDb();
  const source = getSequence(projectId, sourceSequenceId);
  if (!source) throw new Error("Sequence not found");

  const ts = nowMs();
  const newSequenceId = nanoid();
  const sortOrder =
    listSequencesForProject(projectId).length;

  const sourceTimeline = parseTimelineState(source.timelineJson);
  const shotIdMap = new Map<string, string>();

  db.insert(schema.sequences)
    .values({
      id: newSequenceId,
      projectId,
      name: name?.trim() || `${source.name} (copy)`,
      sortOrder,
      timelineJson: source.timelineJson,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  const sourceShots = listShotsForSequence(projectId, sourceSequenceId);
  for (const shot of sourceShots) {
    const newShotId = nanoid();
    shotIdMap.set(shot.id, newShotId);
    const { id: _id, sequenceId: _seq, createdAt, updatedAt, ...rest } = shot;
    db.insert(schema.shots)
      .values({
        ...rest,
        id: newShotId,
        sequenceId: newSequenceId,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const cast = getShotCharacterCast(shot.id);
    if (cast.length) {
      syncShotCharacterCast(newShotId, projectId, cast);
    }
  }

  const newTimeline = remapTimelineShotRefs(sourceTimeline, shotIdMap);

  db.update(schema.sequences)
    .set({
      timelineJson: serializeTimelineState(newTimeline),
      updatedAt: ts,
    })
    .where(eq(schema.sequences.id, newSequenceId))
    .run();

  const sourceAudio = db
    .select()
    .from(schema.audioTracks)
    .where(
      and(
        eq(schema.audioTracks.projectId, projectId),
        eq(schema.audioTracks.sequenceId, sourceSequenceId)
      )
    )
    .all();

  for (const track of sourceAudio) {
    const newTrackId = nanoid();
    const mappedTarget =
      track.targetShotId && shotIdMap.has(track.targetShotId)
        ? shotIdMap.get(track.targetShotId)!
        : track.targetShotId;
    db.insert(schema.audioTracks)
      .values({
        ...track,
        id: newTrackId,
        sequenceId: newSequenceId,
        targetShotId: mappedTarget ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }

  return getSequence(projectId, newSequenceId)!;
}

export function moveShotToSequence(
  projectId: string,
  shotId: string,
  targetSequenceId: string
) {
  const db = getDb();
  if (!sequenceBelongsToProject(projectId, targetSequenceId)) {
    throw new Error("Target sequence not found");
  }
  const shot = db
    .select()
    .from(schema.shots)
    .where(
      and(eq(schema.shots.id, shotId), eq(schema.shots.projectId, projectId))
    )
    .get();
  if (!shot) throw new Error("Shot not found");

  const targetShots = listShotsForSequence(projectId, targetSequenceId);
  const sortOrder = targetShots.length;
  const ts = nowMs();

  db.update(schema.shots)
    .set({
      sequenceId: targetSequenceId,
      sortOrder,
      updatedAt: ts,
    })
    .where(eq(schema.shots.id, shotId))
    .run();

  return db.select().from(schema.shots).where(eq(schema.shots.id, shotId)).get()!;
}

export function ensureProjectHasSequence(projectId: string, fps = 24) {
  const id = getDefaultSequenceId(projectId);
  if (id) return id;
  return createDefaultSequenceForProject(projectId, fps).id;
}
