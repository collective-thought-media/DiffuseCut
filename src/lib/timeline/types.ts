export type TimelineTrackType = "video" | "audio";

export type TimelineClipSourceType = "shot" | "file" | "image";

export type TimelineTransitionType =
  | "fade_black"
  | "fade_white"
  | "dissolve"
  | "wipe_left"
  | "wipe_right";

export interface TimelineTransition {
  type: TimelineTransitionType;
  durationSeconds: number;
}

export interface TimelineClip {
  id: string;
  name: string;
  sourceType: TimelineClipSourceType;
  /** shot id or project-relative media path */
  sourceRef: string;
  sourceUrl: string;
  startFrame: number;
  durationFrames: number;
  trimInFrames: number;
  trimOutFrames: number | null;
  volume?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  transitionIn?: TimelineTransition;
  transitionOut?: TimelineTransition;
  /** Links video clip to matching audio on the timeline (NLE preview). */
  groupId?: string | null;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: TimelineTrackType;
  clips: TimelineClip[];
  volume?: number;
  muted?: boolean;
  locked?: boolean;
}

export interface TimelineFormat {
  aspectRatio: string;
  width: number;
  height: number;
}

export interface TimelineState {
  fps: number;
  format: TimelineFormat;
  videoTracks: TimelineTrack[];
  audioTracks: TimelineTrack[];
}
