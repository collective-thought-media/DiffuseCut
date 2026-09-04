"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Shot } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/button";

interface ShotClipProps {
  shot: Shot;
  pixelsPerFrame: number;
  selected: boolean;
  active?: boolean;
  onSelect: () => void;
}

export function ShotClip({
  shot,
  pixelsPerFrame,
  selected,
  active = false,
  onSelect,
}: ShotClipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id });

  const width = Math.max(shot.durationFrames * pixelsPerFrame, 48);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex h-16 shrink-0 cursor-grab flex-col justify-between rounded-md px-2 py-1.5 active:cursor-grabbing",
        selected
          ? "bg-primary/15 border border-primary"
          : active
            ? "border border-primary/50 bg-primary/5"
            : "border border-transparent bg-neutral-900 hover:bg-neutral-800",
        isDragging && "z-10 opacity-80"
      )}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <span className="truncate text-xs font-medium">
        {shot.title || "Untitled"}
      </span>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-muted-foreground">
          {shot.durationFrames}f
        </span>
        <Badge className="text-[10px]">{shot.renderStatus}</Badge>
      </div>
    </div>
  );
}
