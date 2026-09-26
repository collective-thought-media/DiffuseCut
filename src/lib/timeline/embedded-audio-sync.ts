import { nanoid } from "@/lib/utils";
import type { TimelineClip, TimelineState } from "@/lib/timeline/types";
import { isVideoClip } from "@/lib/timeline/video-layout";

const EMBEDDED_PREFIX = "embedded:";

export function embeddedAudioGroupId(videoClipId: string): string {
  return `${EMBEDDED_PREFIX}${videoClipId}`;
}

export function isEmbeddedAudioClip(clip: TimelineClip): boolean {
  return (
    typeof clip.groupId === "string" && clip.groupId.startsWith(EMBEDDED_PREFIX)
  );
}

/** Stable fingerprint for whether embedded lanes match video (persist when this changes). */
export function embeddedAudioSyncFingerprint(state: TimelineState): string {
  const parts: string[] = [];
  for (let i = 0; i < state.videoTracks.length; i++) {
    const vTrack = state.videoTracks[i];
    const aTrack = state.audioTracks[i];
    if (!vTrack) continue;
    for (const vClip of vTrack.clips) {
      if (!clipCarriesEmbeddedAudio(vClip)) continue;
      parts.push(
        `${vClip.id}:${vClip.startFrame}:${vClip.durationFrames}:${vClip.sourceUrl}`
      );
    }
    for (const aClip of aTrack?.clips ?? []) {
      if (!isEmbeddedAudioClip(aClip)) continue;
      parts.push(`e:${aClip.groupId}:${aClip.startFrame}:${aClip.durationFrames}`);
    }
  }
  return parts.join("|");
}

export function videoClipIdFromEmbeddedGroup(
  groupId: string | null | undefined
): string | null {
  if (!groupId?.startsWith(EMBEDDED_PREFIX)) return null;
  return groupId.slice(EMBEDDED_PREFIX.length);
}

/** True when the timeline clip is a file/shot with muxed audio (not a still). */
export function clipCarriesEmbeddedAudio(clip: TimelineClip): boolean {
  return isVideoClip(clip);
}

function embeddedClipForVideo(
  vClip: TimelineClip,
  existingId: string | null
): TimelineClip {
  return {
    id: existingId ?? nanoid(),
    name: `${vClip.name} (clip audio)`,
    sourceType: vClip.sourceType,
    sourceRef: vClip.sourceRef,
    sourceUrl: vClip.sourceUrl,
    startFrame: vClip.startFrame,
    durationFrames: vClip.durationFrames,
    trimInFrames: vClip.trimInFrames,
    trimOutFrames: vClip.trimOutFrames,
    volume: vClip.volume ?? 1,
    groupId: embeddedAudioGroupId(vClip.id),
  };
}

/**
 * Mirror muxed audio from each video lane onto the matching audio lane (V1→A1, etc.).
 * Score, dialog, and SFX clips on those lanes are preserved; embedded clips are rebuilt.
 */
export function syncEmbeddedAudioLanes(state: TimelineState): TimelineState {
  const existingEmbeddedIds = new Map<string, string>();
  for (const track of state.audioTracks) {
    for (const clip of track.clips) {
      if (!isEmbeddedAudioClip(clip)) continue;
      const vid = videoClipIdFromEmbeddedGroup(clip.groupId);
      if (vid) existingEmbeddedIds.set(vid, clip.id);
    }
  }

  const audioTracks = state.audioTracks.map((track, index) => {
    const kept = track.clips.filter((c) => !isEmbeddedAudioClip(c));
    const videoTrack = state.videoTracks[index];
    if (!videoTrack) {
      return { ...track, clips: kept };
    }

    const embedded: TimelineClip[] = [];
    for (const vClip of videoTrack.clips) {
      if (!clipCarriesEmbeddedAudio(vClip)) continue;
      embedded.push(
        embeddedClipForVideo(vClip, existingEmbeddedIds.get(vClip.id) ?? null)
      );
    }

    return { ...track, clips: [...kept, ...embedded] };
  });

  return { ...state, audioTracks };
}
