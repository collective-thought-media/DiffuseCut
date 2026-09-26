import { nanoid } from "@/lib/utils";
import type { TimelineState, TimelineTrack } from "@/lib/timeline/types";

export const DEFAULT_VIDEO_TRACK_COUNT = 3;
export const DEFAULT_AUDIO_TRACK_COUNT = 3;

function makeVideoTracks(count: number): TimelineTrack[] {
  return Array.from({ length: count }, (_, index) => ({
    id: nanoid(),
    name: `V${index + 1}`,
    type: "video" as const,
    clips: [],
    volume: 1,
    muted: false,
    locked: false,
  }));
}

function makeAudioTracks(count: number): TimelineTrack[] {
  return Array.from({ length: count }, (_, index) => ({
    id: nanoid(),
    name: `A${index + 1}`,
    type: "audio" as const,
    clips: [],
    volume: 1,
    muted: false,
    locked: false,
  }));
}

export function createEmptyTimelineState(fps = 24): TimelineState {
  return {
    fps,
    format: {
      aspectRatio: "16:9",
      width: 1920,
      height: 1080,
    },
    videoTracks: makeVideoTracks(DEFAULT_VIDEO_TRACK_COUNT),
    audioTracks: makeAudioTracks(DEFAULT_AUDIO_TRACK_COUNT),
  };
}

/** Standard NLE layout: V1–V3 and A1–A3, preserving clips on matching indices. */
export function normalizeTimelineTrackLayout(state: TimelineState): TimelineState {
  const template = createEmptyTimelineState(state.fps ?? 24);

  const videoTracks = template.videoTracks.map((track, index) => {
    const existing = state.videoTracks[index];
    if (!existing) return track;
    return {
      ...track,
      id: existing.id,
      clips: existing.clips,
      volume: existing.volume ?? 1,
      muted: existing.muted ?? false,
      locked: existing.locked ?? false,
    };
  });

  const audioTracks = template.audioTracks.map((track, index) => {
    const existing = state.audioTracks[index];
    if (!existing) return track;
    return {
      ...track,
      id: existing.id,
      clips: existing.clips,
      volume: existing.volume ?? 1,
      muted: existing.muted ?? false,
      locked: existing.locked ?? false,
    };
  });

  return {
    ...state,
    videoTracks,
    audioTracks,
  };
}

export function parseTimelineState(json: string | null | undefined): TimelineState {
  if (!json?.trim()) {
    return createEmptyTimelineState();
  }
  try {
    const parsed = JSON.parse(json) as TimelineState;
    if (!parsed.videoTracks?.length) {
      parsed.videoTracks = createEmptyTimelineState(parsed.fps ?? 24).videoTracks;
    }
    if (!parsed.audioTracks?.length) {
      parsed.audioTracks = createEmptyTimelineState(parsed.fps ?? 24).audioTracks;
    }
    return normalizeTimelineTrackLayout(parsed);
  } catch {
    return createEmptyTimelineState();
  }
}

export function serializeTimelineState(state: TimelineState): string {
  return JSON.stringify(normalizeTimelineTrackLayout(state));
}
