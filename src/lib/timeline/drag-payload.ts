export const TIMELINE_DRAG_MIME = "application/vnd.diffusecut-timeline+json";

export type TimelineLibraryDragPayload = {
  name: string;
  sourceType: "shot" | "file" | "image";
  sourceRef: string;
  sourceUrl: string;
  durationFrames: number;
  /** Preferred timeline lane when dropped without a target track. */
  defaultTrackKind: "video" | "audio";
  audioSlot?: 0 | 1 | 2;
};

export function serializeTimelineDragPayload(
  payload: TimelineLibraryDragPayload
): string {
  return JSON.stringify(payload);
}

export function parseTimelineDragPayload(
  data: string
): TimelineLibraryDragPayload | null {
  if (!data?.trim()) return null;
  try {
    return JSON.parse(data) as TimelineLibraryDragPayload;
  } catch {
    return null;
  }
}
