"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { Shot } from "@/lib/db/schema";
import {
  frameAtTimelinePosition,
  shotStartFrame,
  timelinePlayheadOffsetPx,
  timelineTrackTranslatePx,
} from "@/lib/timing/frames";
import { ShotClip } from "./ShotClip";
import { StoryboardPreview } from "./StoryboardPreview";
import { TransportControls } from "./TransportControls";

interface TimelineProps {
  projectId: string;
  shots: Shot[];
  fps: number;
  selectedShotId: string | null;
  currentFrame: number;
  playing: boolean;
  onSelectShot: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (frame: number) => void;
}

const PIXELS_PER_FRAME = 3;

export function Timeline({
  projectId,
  shots,
  fps,
  selectedShotId,
  currentFrame,
  playing,
  onSelectShot,
  onReorder,
  onPlayPause,
  onStop,
  onSeek,
}: TimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const updateWidth = () => {
      setViewportWidth(node.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const totalFrames = shots.reduce((sum, s) => sum + s.durationFrames, 0);
  const activeShotId =
    shots[frameAtTimelinePosition(shots, currentFrame).shotIndex]?.id ?? null;
  const playheadLeft = timelinePlayheadOffsetPx(
    shots,
    currentFrame,
    PIXELS_PER_FRAME
  );
  const trackTranslateX =
    viewportWidth > 0
      ? timelineTrackTranslatePx(playheadLeft, viewportWidth)
      : 0;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = shots.findIndex((s) => s.id === active.id);
    const newIndex = shots.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = [...shots];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorder(reordered.map((s) => s.id));
  }

  return (
    <div className="space-y-3">
      <StoryboardPreview
        projectId={projectId}
        shots={shots}
        currentFrame={currentFrame}
        fps={fps}
      />

      <TransportControls
        playing={playing}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        fps={fps}
        onPlayPause={onPlayPause}
        onStop={onStop}
        onSeek={onSeek}
      />

      <div ref={viewportRef} className="relative overflow-hidden px-1 py-2">
        {shots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No shots on timeline. Add a shot to begin.
          </p>
        ) : (
          <>
            <div
              className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2"
              aria-hidden
            >
              <div className="h-0 w-0 border-x-[4px] border-x-transparent border-b-[5px] border-b-primary drop-shadow-[0_0_4px_rgba(255,160,122,0.75)]" />
            </div>
            <div
              className="pointer-events-none absolute bottom-0 left-1/2 top-2 z-10 w-px -translate-x-1/2 bg-primary/40"
              aria-hidden
            />

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={shots.map((s) => s.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div
                  className="relative pt-2.5 will-change-transform"
                  style={{ transform: `translateX(${trackTranslateX}px)` }}
                >
                  <div className="relative flex w-max gap-1.5">
                    {shots.map((shot, index) => (
                      <ShotClip
                        key={shot.id}
                        shot={shot}
                        pixelsPerFrame={PIXELS_PER_FRAME}
                        selected={selectedShotId === shot.id}
                        active={activeShotId === shot.id}
                        onSelect={() => {
                          onSeek(shotStartFrame(shots, index));
                          onSelectShot(shot.id);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>
    </div>
  );
}
