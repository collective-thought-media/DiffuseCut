import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { AudioTrack, Shot } from "@/lib/db/schema";
import { nanoid } from "@/lib/utils";
import type { TimelineClip, TimelineState } from "@/lib/timeline/types";
import {
  createEmptyTimelineState,
  normalizeTimelineTrackLayout,
} from "@/lib/timeline/defaults";
import { listShotsForSequence } from "@/lib/services/sequences";
import { shotTimelineFrames } from "@/lib/timing/frames";
import { mediaUrl } from "@/lib/media-url";
import {
  isEmbeddedAudioClip,
  syncEmbeddedAudioLanes,
} from "@/lib/timeline/embedded-audio-sync";
import { clipEndFrame } from "@/lib/timeline/playhead";
import { isVideoClip } from "@/lib/timeline/video-layout";

function shotMediaPath(
  projectId: string,
  shot: Shot
): {
  sourceType: "shot";
  sourceRef: string;
  sourceUrl: string;
  trimInFrames: number;
  trimOutFrames: number | null;
  durationFrames: number;
} | null {
  const path = shot.videoPath ?? shot.placeholderPath;
  if (!path) return null;
  const durationFrames = shotTimelineFrames(shot);
  return {
    sourceType: "shot",
    sourceRef: shot.id,
    sourceUrl: mediaUrl(projectId, path, { version: shot.updatedAt }),
    trimInFrames: shot.trimInFrames ?? 0,
    trimOutFrames: shot.trimOutFrames,
    durationFrames,
  };
}

/** Point timeline shot clips at current render (or still) paths from the storyboard DB. */
export function refreshShotClipMediaFromShots(
  projectId: string,
  state: TimelineState,
  shots: Shot[]
): TimelineState {
  const shotById = new Map(shots.map((s) => [s.id, s]));

  const refreshClip = (clip: TimelineClip): TimelineClip => {
    if (clip.sourceType !== "shot") return clip;
    const shot = shotById.get(clip.sourceRef);
    if (!shot) return clip;
    const media = shotMediaPath(projectId, shot);
    if (!media) return clip;
    if (
      media.sourceUrl === clip.sourceUrl &&
      media.durationFrames === clip.durationFrames &&
      media.trimInFrames === clip.trimInFrames &&
      media.trimOutFrames === clip.trimOutFrames
    ) {
      return clip;
    }
    return {
      ...clip,
      sourceUrl: media.sourceUrl,
      durationFrames: media.durationFrames,
      trimInFrames: media.trimInFrames,
      trimOutFrames: media.trimOutFrames,
    };
  };

  return {
    ...state,
    videoTracks: state.videoTracks.map((track) => ({
      ...track,
      clips: track.clips.map(refreshClip),
    })),
  };
}

function pickPreferredShotClip(
  a: TimelineClip,
  b: TimelineClip
): TimelineClip {
  if (isVideoClip(a) && !isVideoClip(b)) return a;
  if (isVideoClip(b) && !isVideoClip(a)) return b;
  return a.startFrame <= b.startFrame ? a : b;
}

function primaryShotClipsNeedReconcile(
  projectId: string,
  state: TimelineState,
  shots: Shot[]
): boolean {
  const track = state.videoTracks[0];
  if (!track) return false;

  const shotIds = new Set(shots.map((s) => s.id));
  const shotClips = track.clips.filter((c) => c.sourceType === "shot");
  if (shotClips.some((c) => !shotIds.has(c.sourceRef))) return true;

  const perRef = new Map<string, number>();
  for (const clip of shotClips) {
    perRef.set(clip.sourceRef, (perRef.get(clip.sourceRef) ?? 0) + 1);
  }
  if ([...perRef.values()].some((n) => n > 1)) return true;

  const expectedShotCount = shots.filter(
    (s) => shotMediaPath(projectId, s) != null
  ).length;
  if (shotClips.length !== expectedShotCount) return true;

  const ordered = [...shotClips].sort(
    (a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id)
  );
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;
    if (cur.startFrame < clipEndFrame(prev) - 1) return true;
  }

  for (const shot of shots) {
    const media = shotMediaPath(projectId, shot);
    if (!media) continue;
    const clip = shotClips.find((c) => c.sourceRef === shot.id);
    if (!clip) return true;
    if (clip.sourceUrl !== media.sourceUrl) return true;
  }

  return false;
}

/**
 * Rebuild V1 shot clips in storyboard order for this sequence only.
 * Fixes duplicate lanes, foreign shot refs, and stale still paths.
 */
export function reconcilePrimaryVideoTrackWithShots(
  projectId: string,
  state: TimelineState,
  shots: Shot[]
): TimelineState {
  const track = state.videoTracks[0];
  if (!track) return state;

  if (!primaryShotClipsNeedReconcile(projectId, state, shots)) {
    return state;
  }

  const libraryClips = track.clips.filter((c) => c.sourceType !== "shot");
  const existingByRef = new Map<string, TimelineClip>();
  for (const clip of track.clips) {
    if (clip.sourceType !== "shot") continue;
    if (!shots.some((s) => s.id === clip.sourceRef)) continue;
    const prev = existingByRef.get(clip.sourceRef);
    existingByRef.set(
      clip.sourceRef,
      prev ? pickPreferredShotClip(prev, clip) : clip
    );
  }

  let cursor = 0;
  const shotTimelineClips: TimelineClip[] = [];
  for (const shot of shots) {
    const media = shotMediaPath(projectId, shot);
    if (!media) continue;
    const prev = existingByRef.get(shot.id);
    const durationFrames = prev?.durationFrames ?? media.durationFrames;
    shotTimelineClips.push({
      id: prev?.id ?? nanoid(),
      name: prev?.name?.trim() || shot.title?.trim() || "Shot",
      sourceType: "shot",
      sourceRef: shot.id,
      sourceUrl: media.sourceUrl,
      startFrame: cursor,
      durationFrames,
      trimInFrames: prev?.trimInFrames ?? media.trimInFrames,
      trimOutFrames: prev?.trimOutFrames ?? media.trimOutFrames,
      volume: prev?.volume ?? 1,
    });
    cursor += durationFrames;
  }

  return {
    ...state,
    videoTracks: state.videoTracks.map((t, index) =>
      index === 0
        ? { ...t, clips: [...libraryClips, ...shotTimelineClips] }
        : t
    ),
  };
}

function shotStartFrameMap(shots: Shot[]): Map<string, number> {
  let cursor = 0;
  const map = new Map<string, number>();
  for (const shot of shots) {
    map.set(shot.id, cursor);
    cursor += shotTimelineFrames(shot);
  }
  return map;
}

/** A1 = embedded clip audio from V1; score/dialog on A2; SFX on A3. */
function audioKindTrackIndex(kind: AudioTrack["kind"]): number {
  if (kind === "music") return 1;
  if (kind === "voiceover") return 1;
  return 2;
}

function isUsableAudioFile(filePath: string): boolean {
  const normalized = filePath.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("pending")) return false;
  return true;
}

function audioTrackToTimelineClip(
  projectId: string,
  track: AudioTrack,
  startFrame: number,
  durationFrames: number
): TimelineClip {
  return {
    id: nanoid(),
    name: track.label?.trim() || track.kind,
    sourceType: "file",
    sourceRef: track.filePath,
    sourceUrl: mediaUrl(projectId, track.filePath, { version: track.updatedAt }),
    startFrame,
    durationFrames: Math.max(1, durationFrames),
    trimInFrames: 0,
    trimOutFrames: null,
    volume: track.volume ?? 1,
  };
}

function buildAudioTrackClips(
  projectId: string,
  sequenceId: string,
  shots: Shot[],
  fps: number
): TimelineClip[][] {
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
    .orderBy(asc(schema.audioTracks.startFrame), asc(schema.audioTracks.createdAt))
    .all();

  const slots: TimelineClip[][] = [[], [], []];
  const shotStarts = shotStartFrameMap(shots);

  for (const track of tracks) {
    if (!isUsableAudioFile(track.filePath)) continue;
    const slot = audioKindTrackIndex(track.kind);
    let startFrame = track.startFrame ?? 0;
    if (track.targetShotId && shotStarts.has(track.targetShotId)) {
      startFrame = shotStarts.get(track.targetShotId)! + (track.startFrame ?? 0);
    }
    const durationFrames =
      track.durationFrames ??
      Math.max(fps * 2, shotTimelineFrames(shots[0] ?? { durationFrames: fps * 2 }));
    slots[slot].push(
      audioTrackToTimelineClip(projectId, track, startFrame, durationFrames)
    );
  }

  return slots;
}

export function timelineVideoTrackIsEmpty(state: TimelineState): boolean {
  return (state.videoTracks[0]?.clips.length ?? 0) === 0;
}

export function timelineAudioTracksAreEmpty(state: TimelineState): boolean {
  return state.audioTracks.every((track) => track.clips.length === 0);
}

function nonEmbeddedClips(track: TimelineState["audioTracks"][number]) {
  return track.clips.filter((c) => !isEmbeddedAudioClip(c));
}

/** Score/SFX on A1 (legacy) move to A2/A3 so A1 stays clip-audio only. */
export function relocateFinishingAudioOffA1(
  state: TimelineState
): TimelineState {
  const a1 = state.audioTracks[0];
  const a2 = state.audioTracks[1];
  if (!a1 || !a2) return state;

  const misplaced = nonEmbeddedClips(a1);
  if (misplaced.length === 0) return state;

  const embeddedOnly = a1.clips.filter((c) => isEmbeddedAudioClip(c));
  const audioTracks = state.audioTracks.map((track, index) => {
    if (index === 0) {
      return { ...track, clips: embeddedOnly };
    }
    if (index === 1) {
      const existing = nonEmbeddedClips(track);
      const merged = [...existing];
      for (const clip of misplaced) {
        if (!merged.some((c) => c.sourceRef === clip.sourceRef)) {
          merged.push(clip);
        }
      }
      return { ...track, clips: merged };
    }
    return track;
  });

  return { ...state, audioTracks };
}

function timelineHasNonEmbeddedOnLane(
  state: TimelineState,
  laneIndex: number
): boolean {
  const track = state.audioTracks[laneIndex];
  if (!track) return false;
  return nonEmbeddedClips(track).length > 0;
}

/** Pull Finishing desk audio onto A2/A3 when those lanes have no score/SFX yet. */
export function mergeFinishingAudioIntoTimeline(
  projectId: string,
  sequenceId: string,
  fps: number,
  state: TimelineState,
  shots: Shot[]
): TimelineState {
  const slots = buildAudioTrackClips(projectId, sequenceId, shots, fps);
  let next = state;

  const laneIndexes = [1, 2] as const;
  for (const laneIndex of laneIndexes) {
    if (timelineHasNonEmbeddedOnLane(next, laneIndex)) continue;
    const incoming = slots[laneIndex] ?? [];
    if (incoming.length === 0) continue;
    next = {
      ...next,
      audioTracks: next.audioTracks.map((track, index) =>
        index === laneIndex
          ? { ...track, clips: [...track.clips, ...incoming] }
          : track
      ),
    };
  }

  return next;
}

export function buildTimelineFromShots(
  projectId: string,
  sequenceId: string,
  fps: number,
  existing?: TimelineState
): TimelineState {
  const base = normalizeTimelineTrackLayout(existing ?? createEmptyTimelineState(fps));
  const shots = listShotsForSequence(projectId, sequenceId);
  const videoTrack = base.videoTracks[0];
  if (!videoTrack) return base;

  let cursor = 0;
  const clips: TimelineClip[] = [];

  for (const shot of shots) {
    const media = shotMediaPath(projectId, shot);
    if (!media) continue;
    clips.push({
      id: nanoid(),
      name: shot.title?.trim() || "Shot",
      sourceType: "shot",
      sourceRef: shot.id,
      sourceUrl: media.sourceUrl,
      startFrame: cursor,
      durationFrames: media.durationFrames,
      trimInFrames: media.trimInFrames,
      trimOutFrames: media.trimOutFrames,
      volume: 1,
    });
    cursor += media.durationFrames;
  }

  const audioSlots = buildAudioTrackClips(projectId, sequenceId, shots, fps);
  const audioTracks = base.audioTracks.map((track, index) => ({
    ...track,
    clips: audioSlots[index] ?? [],
  }));

  return syncEmbeddedAudioLanes({
    ...base,
    fps,
    videoTracks: base.videoTracks.map((track, index) =>
      index === 0 ? { ...videoTrack, clips } : track
    ),
    audioTracks,
  });
}

/** Fill V1 when empty; merge score/SFX from Finishing when A2/A3 lack those clips. */
export function buildTimelineFromSequence(
  projectId: string,
  sequenceId: string,
  fps: number,
  existing: TimelineState
): TimelineState {
  const normalized = normalizeTimelineTrackLayout(existing);
  const shots = listShotsForSequence(projectId, sequenceId);

  let next = reconcilePrimaryVideoTrackWithShots(projectId, normalized, shots);
  next = refreshShotClipMediaFromShots(projectId, next, shots);

  if (timelineVideoTrackIsEmpty(normalized)) {
    next = buildTimelineFromShots(projectId, sequenceId, fps, next);
  } else {
    next = mergeFinishingAudioIntoTimeline(
      projectId,
      sequenceId,
      fps,
      next,
      shots
    );
  }

  next = relocateFinishingAudioOffA1(next);
  return syncEmbeddedAudioLanes(next);
}
