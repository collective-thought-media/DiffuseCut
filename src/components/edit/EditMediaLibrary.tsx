"use client";

import type { AudioTrack, Shot } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { resolveShotLibraryThumb } from "@/lib/finishing/shot-preview-media";
import { shotTimelineFrames } from "@/lib/timing/frames";
import {
  TIMELINE_DRAG_MIME,
  serializeTimelineDragPayload,
  type TimelineLibraryDragPayload,
} from "@/lib/timeline/drag-payload";

type Props = {
  projectId: string;
  shots: Shot[];
  audioTracks: AudioTrack[];
  fps: number;
  onInsert: (payload: TimelineLibraryDragPayload) => void;
};

function shotPayload(projectId: string, shot: Shot): TimelineLibraryDragPayload | null {
  const path = shot.videoPath ?? shot.placeholderPath;
  if (!path) return null;
  return {
    name: shot.title?.trim() || "Shot",
    sourceType: shot.videoPath ? "shot" : "image",
    sourceRef: shot.id,
    sourceUrl: mediaUrl(projectId, path, { version: shot.updatedAt }),
    durationFrames: shotTimelineFrames(shot),
    defaultTrackKind: "video",
  };
}

function audioSlotForKind(kind: AudioTrack["kind"]): 0 | 1 | 2 {
  if (kind === "music") return 0;
  if (kind === "voiceover") return 1;
  return 2;
}

function audioPayload(
  projectId: string,
  track: AudioTrack,
  fps: number
): TimelineLibraryDragPayload | null {
  if (!track.filePath?.trim() || track.filePath.includes("pending")) return null;
  return {
    name: track.label?.trim() || track.kind,
    sourceType: "file",
    sourceRef: track.filePath,
    sourceUrl: mediaUrl(projectId, track.filePath, { version: track.updatedAt }),
    durationFrames: track.durationFrames ?? fps * 8,
    defaultTrackKind: "audio",
    audioSlot: audioSlotForKind(track.kind),
  };
}

function MediaChip({
  label,
  sublabel,
  thumbSrc,
  thumbKind,
  onAdd,
  onDragStart,
}: {
  label: string;
  sublabel?: string;
  thumbSrc?: string | null;
  thumbKind?: "image" | "video";
  onAdd: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group flex w-[104px] shrink-0 cursor-grab flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-900/70 active:cursor-grabbing hover:border-neutral-600"
    >
      <button
        type="button"
        className="flex flex-col text-left"
        onClick={onAdd}
        title="Add at playhead"
      >
        <div className="relative h-14 w-full bg-neutral-950">
          {thumbSrc && thumbKind === "video" ? (
            <video
              src={thumbSrc}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
              draggable={false}
            />
          ) : thumbSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbSrc}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              {sublabel ?? "Media"}
            </div>
          )}
        </div>
        <div className="border-t border-neutral-800 px-1.5 py-1">
          <p className="truncate text-[10px] text-foreground">{label}</p>
          {sublabel ? (
            <p className="truncate text-[9px] text-muted-foreground">{sublabel}</p>
          ) : null}
        </div>
      </button>
    </div>
  );
}

export function EditMediaLibrary({
  projectId,
  shots,
  audioTracks,
  fps,
  onInsert,
}: Props) {
  const shotItems = shots
    .map((shot) => ({ shot, payload: shotPayload(projectId, shot) }))
    .filter((row) => row.payload != null) as {
    shot: Shot;
    payload: TimelineLibraryDragPayload;
  }[];

  const audioItems = audioTracks
    .map((track) => ({ track, payload: audioPayload(projectId, track, fps) }))
    .filter((row) => row.payload != null) as {
    track: AudioTrack;
    payload: TimelineLibraryDragPayload;
  }[];

  function bindDrag(payload: TimelineLibraryDragPayload) {
    return (e: React.DragEvent) => {
      e.dataTransfer.setData(TIMELINE_DRAG_MIME, serializeTimelineDragPayload(payload));
      e.dataTransfer.effectAllowed = "copy";
    };
  }

  return (
    <section className="w-full rounded-md border border-neutral-800 bg-neutral-950 p-2">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Library
        </h3>
        <p className="text-[10px] text-muted-foreground">
          Click adds at playhead. Drag onto V1–V3 or A1–A3.
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <p className="mb-1 text-[10px] font-medium text-muted-foreground">
            Sequence shots ({shotItems.length})
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {shotItems.length === 0 ? (
              <p className="py-2 text-[10px] text-muted-foreground">
                No rendered stills or video yet.
              </p>
            ) : (
              shotItems.map(({ shot, payload }) => {
                const thumb = resolveShotLibraryThumb(projectId, shot);
                return (
                  <MediaChip
                    key={shot.id}
                    label={payload.name}
                    sublabel={shot.videoPath ? "Video" : "Still"}
                    thumbSrc={thumb?.src ?? null}
                    thumbKind={thumb?.kind}
                    onAdd={() => onInsert(payload)}
                    onDragStart={bindDrag(payload)}
                  />
                );
              })
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[10px] font-medium text-muted-foreground">
            Score / dialog / SFX ({audioItems.length})
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {audioItems.length === 0 ? (
              <p className="py-2 text-[10px] text-muted-foreground">
                Generate audio in the tabs below the timeline.
              </p>
            ) : (
              audioItems.map(({ track, payload }) => (
                <MediaChip
                  key={track.id}
                  label={payload.name}
                  sublabel={track.kind}
                  onAdd={() => onInsert(payload)}
                  onDragStart={bindDrag(payload)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
