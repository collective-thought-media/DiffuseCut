import { describe, expect, it } from "vitest";
import type { TimelineClip, TimelineState } from "@/lib/timeline/types";
import {
  isVideoClip,
  mediaTimeSecForTimelineFrame,
  timelineFrameFromMediaTimeSec,
} from "@/lib/timeline/video-layout";

const clip: TimelineClip = {
  id: "c1",
  name: "Test",
  sourceType: "shot",
  sourceRef: "shot-1",
  sourceUrl: "/api/media/p/s.mp4",
  startFrame: 100,
  durationFrames: 72,
  trimInFrames: 0,
  trimOutFrames: 72,
};

const timeline: TimelineState = {
  fps: 24,
  format: { aspectRatio: "16:9", width: 1920, height: 1080 },
  videoTracks: [
    { id: "v1", name: "V1", type: "video", clips: [clip] },
    { id: "v2", name: "V2", type: "video", clips: [] },
    { id: "v3", name: "V3", type: "video", clips: [] },
  ],
  audioTracks: [],
};

describe("timeline video layout (NLE preview)", () => {
  it("treats shot PNG as still and shot MP4 as video", () => {
    expect(
      isVideoClip({
        ...clip,
        sourceUrl: "/api/media/p/storyboard/01.png",
      })
    ).toBe(false);
    expect(isVideoClip(clip)).toBe(true);
  });

  it("round-trips timeline frame and media time within a clip", () => {
    const frame = 142;
    const t = mediaTimeSecForTimelineFrame(clip, frame, timeline.fps);
    const back = timelineFrameFromMediaTimeSec(clip, t, timeline.fps);
    expect(back).toBe(frame);
  });
});
