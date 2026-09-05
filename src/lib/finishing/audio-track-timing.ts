import type { AudioTrack, Shot } from "@/lib/db/schema";
import {
  shotTimelineFrames,
  trimmedShotStartFrame,
} from "@/lib/timing/frames";

export type AudioTrackSpanMode =
  | "full_timeline"
  | "rest_of_timeline"
  | "single_shot"
  | "custom";

export const AUDIO_SPAN_MODES: {
  value: AudioTrackSpanMode;
  label: string;
  description: string;
}[] = [
  {
    value: "full_timeline",
    label: "Full film",
    description: "One continuous bed from frame 0 through the last shot.",
  },
  {
    value: "rest_of_timeline",
    label: "From start frame to end",
    description: "Runs from the start frame through the end of the edit.",
  },
  {
    value: "single_shot",
    label: "Single shot",
    description: "Locked to one storyboard shot length and position.",
  },
  {
    value: "custom",
    label: "Custom length",
    description: "You set start frame and duration in seconds.",
  },
];

export function parseSpanMode(value: string | null | undefined): AudioTrackSpanMode {
  if (
    value === "full_timeline" ||
    value === "rest_of_timeline" ||
    value === "single_shot" ||
    value === "custom"
  ) {
    return value;
  }
  return "full_timeline";
}

export function resolveTrackTiming(
  track: Pick<
    AudioTrack,
    "startFrame" | "durationFrames" | "spanMode" | "targetShotId"
  >,
  shots: Shot[],
  totalFrames: number
): { startFrame: number; durationFrames: number; endFrame: number } {
  const mode = parseSpanMode(track.spanMode);
  const safeTotal = Math.max(1, totalFrames);

  if (mode === "full_timeline") {
    return {
      startFrame: 0,
      durationFrames: safeTotal,
      endFrame: safeTotal,
    };
  }

  if (mode === "single_shot" && track.targetShotId) {
    const shotIndex = shots.findIndex((s) => s.id === track.targetShotId);
    if (shotIndex >= 0) {
      const shot = shots[shotIndex];
      const startFrame = trimmedShotStartFrame(shots, shotIndex);
      const durationFrames = shotTimelineFrames(shot);
      return {
        startFrame,
        durationFrames,
        endFrame: startFrame + durationFrames,
      };
    }
  }

  if (mode === "rest_of_timeline") {
    const startFrame = Math.max(0, Math.min(track.startFrame, safeTotal - 1));
    const durationFrames = Math.max(1, safeTotal - startFrame);
    return { startFrame, durationFrames, endFrame: startFrame + durationFrames };
  }

  const startFrame = Math.max(0, track.startFrame);
  const durationFrames = Math.max(
    1,
    track.durationFrames ?? Math.max(1, safeTotal - startFrame)
  );
  return {
    startFrame,
    durationFrames,
    endFrame: startFrame + durationFrames,
  };
}

export function applySpanModeToTrack(
  track: Pick<
    AudioTrack,
    "startFrame" | "durationFrames" | "spanMode" | "targetShotId"
  >,
  shots: Shot[],
  totalFrames: number,
  patch?: Partial<{
    spanMode: AudioTrackSpanMode;
    startFrame: number;
    durationFrames: number | null;
    targetShotId: string | null;
  }>
): {
  spanMode: AudioTrackSpanMode;
  startFrame: number;
  durationFrames: number;
  targetShotId: string | null;
} {
  const merged = {
    spanMode: parseSpanMode(patch?.spanMode ?? track.spanMode),
    startFrame: patch?.startFrame ?? track.startFrame,
    durationFrames: patch?.durationFrames ?? track.durationFrames,
    targetShotId:
      patch?.targetShotId !== undefined
        ? patch.targetShotId
        : track.targetShotId,
  };

  if (merged.spanMode === "single_shot" && !merged.targetShotId && shots[0]) {
    merged.targetShotId = shots[0].id;
  }

  const timing = resolveTrackTiming(
    {
      startFrame: merged.startFrame,
      durationFrames: merged.durationFrames,
      spanMode: merged.spanMode,
      targetShotId: merged.targetShotId,
    },
    shots,
    totalFrames
  );

  return {
    spanMode: merged.spanMode,
    startFrame: timing.startFrame,
    durationFrames: timing.durationFrames,
    targetShotId: merged.targetShotId,
  };
}

export function formatTrackSpanSummary(
  track: Pick<
    AudioTrack,
    "startFrame" | "durationFrames" | "spanMode" | "targetShotId"
  >,
  shots: Shot[],
  totalFrames: number,
  fps: number
): string {
  const timing = resolveTrackTiming(track, shots, totalFrames);
  const startSec = (timing.startFrame / fps).toFixed(2);
  const durationSec = (timing.durationFrames / fps).toFixed(2);
  const endSec = (timing.endFrame / fps).toFixed(2);
  const mode = AUDIO_SPAN_MODES.find((m) => m.value === parseSpanMode(track.spanMode));

  if (parseSpanMode(track.spanMode) === "single_shot" && track.targetShotId) {
    const shot = shots.find((s) => s.id === track.targetShotId);
    const title = shot?.title?.trim() || "Selected shot";
    return `${title}: ${durationSec}s (frames ${timing.startFrame} to ${timing.endFrame})`;
  }

  return `${mode?.label ?? "Custom"}: ${startSec}s to ${endSec}s (${durationSec}s, ${timing.durationFrames} frames)`;
}

export function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}
