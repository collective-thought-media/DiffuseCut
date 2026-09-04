"use client";

import { useCallback, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Shot } from "@/lib/db/schema";
import { clampTrim, framesFromClipDelta } from "@/lib/finishing/trim";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/button";

type TrimHandle = "in" | "out";

interface TrimShotClipProps {
  shot: Shot;
  pixelsPerFrame: number;
  selected: boolean;
  active?: boolean;
  onSelect: () => void;
  onUpdateTrim: (
    trimInFrames: number,
    trimOutFrames: number,
    previewEdge?: "in" | "out"
  ) => void;
}

export function TrimShotClip({
  shot,
  pixelsPerFrame,
  selected,
  active = false,
  onSelect,
  onUpdateTrim,
}: TrimShotClipProps) {
  const trimOut = shot.trimOutFrames ?? shot.durationFrames;
  const clipWidth = Math.max(shot.durationFrames * pixelsPerFrame, 48);
  const inPx = shot.trimInFrames * pixelsPerFrame;
  const outPx = trimOut * pixelsPerFrame;

  const [draggingHandle, setDraggingHandle] = useState<TrimHandle | null>(null);
  const dragOriginRef = useRef<{
    x: number;
    trimIn: number;
    trimOut: number;
  } | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: clipWidth,
  };

  const applyTrim = useCallback(
    (trimIn: number, trimOutValue: number, previewEdge?: "in" | "out") => {
      const clamped = clampTrim(shot.durationFrames, trimIn, trimOutValue);
      onUpdateTrim(
        clamped.trimInFrames,
        clamped.trimOutFrames,
        previewEdge
      );
    },
    [onUpdateTrim, shot.durationFrames]
  );

  function startHandleDrag(handle: TrimHandle, clientX: number) {
    setDraggingHandle(handle);
    dragOriginRef.current = {
      x: clientX,
      trimIn: shot.trimInFrames,
      trimOut,
    };
  }

  function moveHandleDrag(clientX: number) {
    const origin = dragOriginRef.current;
    if (!origin || !draggingHandle) return;

    const deltaFrames = framesFromClipDelta(
      clientX - origin.x,
      pixelsPerFrame
    );

    if (draggingHandle === "in") {
      applyTrim(origin.trimIn + deltaFrames, origin.trimOut, "in");
      return;
    }

    applyTrim(origin.trimIn, origin.trimOut + deltaFrames, "out");
  }

  function endHandleDrag() {
    setDraggingHandle(null);
    dragOriginRef.current = null;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex h-16 shrink-0 flex-col justify-between rounded-md px-2 py-1.5",
        selected
          ? "border border-primary bg-primary/15"
          : active
            ? "border border-primary/50 bg-primary/5"
            : "border border-transparent bg-neutral-900 hover:bg-neutral-800",
        isDragging && "z-10 opacity-80"
      )}
      onClick={onSelect}
    >
      <div
        className="absolute inset-0 cursor-grab rounded-md active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
        <div
          className="absolute inset-y-0 left-0 bg-black/55"
          style={{ width: inPx }}
        />
        <div
          className="absolute inset-y-0 bg-black/55"
          style={{ left: outPx, right: 0 }}
        />
        <div
          className="absolute inset-y-0 border-y border-primary/40 bg-primary/10"
          style={{ left: inPx, width: Math.max(outPx - inPx, 2) }}
        />
      </div>

      <button
        type="button"
        aria-label={`Trim in for ${shot.title || "shot"}`}
        className={cn(
          "absolute bottom-1 top-1 z-20 w-2 -translate-x-1/2 cursor-ew-resize rounded-full border border-primary bg-primary/80 shadow",
          draggingHandle === "in" && "scale-110"
        )}
        style={{ left: inPx }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          startHandleDrag("in", event.clientX);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (draggingHandle !== "in") return;
          moveHandleDrag(event.clientX);
        }}
        onPointerUp={(event) => {
          if (draggingHandle !== "in") return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          endHandleDrag();
        }}
        onPointerCancel={endHandleDrag}
      />

      <button
        type="button"
        aria-label={`Trim out for ${shot.title || "shot"}`}
        className={cn(
          "absolute bottom-1 top-1 z-20 w-2 -translate-x-1/2 cursor-ew-resize rounded-full border border-primary bg-primary/80 shadow",
          draggingHandle === "out" && "scale-110"
        )}
        style={{ left: outPx }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          startHandleDrag("out", event.clientX);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (draggingHandle !== "out") return;
          moveHandleDrag(event.clientX);
        }}
        onPointerUp={(event) => {
          if (draggingHandle !== "out") return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          endHandleDrag();
        }}
        onPointerCancel={endHandleDrag}
      />

      <span className="relative z-10 truncate text-xs font-medium">
        {shot.title || "Untitled"}
      </span>
      <div className="relative z-10 flex items-center justify-between gap-1">
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {shot.trimInFrames}-{trimOut}f
        </span>
        <Badge className="text-[10px]">{shot.renderStatus}</Badge>
      </div>
    </div>
  );
}
