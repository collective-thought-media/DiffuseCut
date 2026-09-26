import { describe, expect, it } from "vitest";
import {
  embeddedAudioGroupId,
  isEmbeddedAudioClip,
  syncEmbeddedAudioLanes,
} from "@/lib/timeline/embedded-audio-sync";
import type { TimelineClip, TimelineState } from "@/lib/timeline/types";

function videoClip(id: string, start: number, dur: number): TimelineClip {
  return {
    id,
    name: "Shot",
    sourceType: "shot",
    sourceRef: id,
    sourceUrl: `/api/media/renders/${id}.mp4`,
    startFrame: start,
    durationFrames: dur,
    trimInFrames: 0,
    trimOutFrames: dur,
  };
}

describe("syncEmbeddedAudioLanes", () => {
  it("adds linked audio on A1 for each V1 video clip", () => {
    const v1Id = "track-v1";
    const a1Id = "track-a1";
    const clip = videoClip("c1", 0, 72);
    const state: TimelineState = {
      fps: 24,
      format: { aspectRatio: "16:9", width: 1920, height: 1080 },
      videoTracks: [{ id: v1Id, name: "V1", type: "video", clips: [clip] }],
      audioTracks: [{ id: a1Id, name: "A1", type: "audio", clips: [] }],
    };
    const synced = syncEmbeddedAudioLanes(state);
    expect(synced.audioTracks[0]?.clips.length).toBe(1);
    const audio = synced.audioTracks[0]!.clips[0]!;
    expect(isEmbeddedAudioClip(audio)).toBe(true);
    expect(audio.groupId).toBe(embeddedAudioGroupId("c1"));
    expect(audio.startFrame).toBe(0);
    expect(audio.durationFrames).toBe(72);
    expect(audio.sourceUrl).toBe(clip.sourceUrl);
  });

  it("keeps score/dialog clips on the same lane", () => {
    const scoreClip: TimelineClip = {
      id: "score",
      name: "Score",
      sourceType: "file",
      sourceRef: "audio/score.m4a",
      sourceUrl: "/api/media/audio/score.m4a",
      startFrame: 0,
      durationFrames: 500,
      trimInFrames: 0,
      trimOutFrames: null,
    };
    const state: TimelineState = {
      fps: 24,
      format: { aspectRatio: "16:9", width: 1920, height: 1080 },
      videoTracks: [
        {
          id: "v1",
          name: "V1",
          type: "video",
          clips: [videoClip("c1", 0, 72)],
        },
      ],
      audioTracks: [
        { id: "a1", name: "A1", type: "audio", clips: [scoreClip] },
      ],
    };
    const synced = syncEmbeddedAudioLanes(state);
    expect(synced.audioTracks[0]?.clips.length).toBe(2);
    expect(synced.audioTracks[0]?.clips.some((c) => c.id === "score")).toBe(
      true
    );
  });
});
