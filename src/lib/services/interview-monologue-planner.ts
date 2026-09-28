/**
 * Plans alternating A/B interview-style storyboard segments for long lip-sync monologues.
 */

export type InterviewCameraPlan = {
  label: string;
  characterStateId: string;
  /** Optional angle when A/B are two refs on one state. */
  characterAngleId?: string | null;
  prompt: string;
  locationStateId?: string | null;
  locationAngleId?: string | null;
};

export type InterviewMonologuePlanInput = {
  totalFrames: number;
  fps: number;
  segmentDurationSec: number;
  /** Which camera leads segment 1 (0 = cameraA, 1 = cameraB). */
  firstCameraIndex?: 0 | 1;
  cameraA: InterviewCameraPlan;
  cameraB: InterviewCameraPlan;
};

export type PlannedInterviewSegment = {
  segmentIndex: number;
  durationFrames: number;
  cameraIndex: 0 | 1;
  camera: InterviewCameraPlan;
  title: string;
};

const MIN_SEGMENT_FRAMES = 48;
const MAX_SEGMENT_FRAMES = 240;

export function segmentFramesFromDurationSec(
  segmentDurationSec: number,
  fps: number
): number {
  const frames = Math.max(1, Math.round(segmentDurationSec * fps));
  return Math.min(MAX_SEGMENT_FRAMES, Math.max(MIN_SEGMENT_FRAMES, frames));
}

export function planInterviewMonologueSegments(
  input: InterviewMonologuePlanInput
): PlannedInterviewSegment[] {
  const { totalFrames, fps, cameraA, cameraB } = input;
  if (totalFrames < 1) {
    throw new Error("totalFrames must be at least 1");
  }
  if (fps < 1) {
    throw new Error("fps must be at least 1");
  }

  const segmentFrames = segmentFramesFromDurationSec(
    input.segmentDurationSec,
    fps
  );
  const first = input.firstCameraIndex ?? 0;
  const cameras: [InterviewCameraPlan, InterviewCameraPlan] = [
    cameraA,
    cameraB,
  ];

  const segments: PlannedInterviewSegment[] = [];
  let remaining = totalFrames;
  let index = 0;

  while (remaining > 0) {
    const durationFrames = Math.min(segmentFrames, remaining);
    const cameraIndex = ((index + first) % 2) as 0 | 1;
    const camera = cameras[cameraIndex]!;
    segments.push({
      segmentIndex: index,
      durationFrames,
      cameraIndex,
      camera,
      title: `Seg ${String(index + 1).padStart(2, "0")} ${camera.label}`,
    });
    remaining -= durationFrames;
    index += 1;
  }

  return segments;
}

export function assertAlternatingCameras(segments: PlannedInterviewSegment[]): void {
  for (let i = 1; i < segments.length; i++) {
    if (segments[i]!.cameraIndex === segments[i - 1]!.cameraIndex) {
      throw new Error(
        `Interview plan violates A/B alternation at segment ${i + 1}`
      );
    }
  }
}

export const DEFAULT_CAMERA_A_PROMPT =
  "Interview camera A, medium shot waist up, subject centered, speaking directly to lens, same studio lighting and wardrobe continuity.";

export const DEFAULT_CAMERA_B_PROMPT =
  "Interview camera B, close shot chest and head, subject centered, speaking directly to lens, same studio lighting and wardrobe continuity.";
