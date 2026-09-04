"use client";

import { useEffect, useMemo } from "react";
import type { Shot } from "@/lib/db/schema";
import { Card } from "@/components/ui/button";
import { mediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import { frameAtTimelinePosition } from "@/lib/timing/frames";

interface StoryboardPreviewProps {
  projectId: string;
  shots: Shot[];
  currentFrame: number;
  fps: number;
}

export function StoryboardPreview({
  projectId,
  shots,
  currentFrame,
  fps,
}: StoryboardPreviewProps) {
  const { shotIndex, frameInShot } = useMemo(
    () => frameAtTimelinePosition(shots, currentFrame),
    [shots, currentFrame]
  );

  const activeShot = shots[shotIndex] ?? null;

  const previewLayers = useMemo(
    () =>
      shots.map((shot) => {
        const src = shot.placeholderPath
          ? mediaUrl(projectId, shot.placeholderPath, {
              version: shot.updatedAt,
            })
          : null;
        return {
          id: shot.id,
          title: shot.title,
          src,
          isVideo: shot.placeholderKind === "video",
        };
      }),
    [projectId, shots]
  );

  useEffect(() => {
    for (const layer of previewLayers) {
      if (!layer.src || layer.isVideo) continue;
      const img = new window.Image();
      img.src = layer.src;
    }
  }, [previewLayers]);

  if (shots.length === 0) {
    return (
      <Card className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
        Add shots to preview the storyboard sequence.
      </Card>
    );
  }

  const durationSec = activeShot
    ? (activeShot.durationFrames / fps).toFixed(2)
    : "0.00";
  const activeLayer = previewLayers[shotIndex] ?? null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative aspect-video w-full bg-black">
        {previewLayers.some((layer) => layer.src) ? (
          previewLayers.map((layer, index) => {
            if (!layer.src) return null;

            const isActive = index === shotIndex;

            if (layer.isVideo) {
              return (
                <video
                  key={layer.id}
                  src={layer.src}
                  className={cn(
                    "absolute inset-0 h-full w-full object-contain",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                  muted
                  playsInline
                  preload="auto"
                  aria-hidden={!isActive}
                />
              );
            }

            return (
              <img
                key={layer.id}
                src={layer.src}
                alt={layer.title || "Shot preview"}
                className={cn(
                  "absolute inset-0 h-full w-full object-contain",
                  isActive ? "opacity-100" : "opacity-0"
                )}
                aria-hidden={!isActive}
                decoding="async"
              />
            );
          })
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            <p className="text-sm font-medium text-foreground">
              {activeShot?.title ?? "Untitled"}
            </p>
            <p className="text-xs">No still image for this shot yet.</p>
          </div>
        )}

        {activeLayer && !activeLayer.src && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black px-4 text-center text-muted-foreground">
            <p className="text-sm font-medium text-foreground">
              {activeShot?.title ?? "Untitled"}
            </p>
            <p className="text-xs">No still image for this shot yet.</p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-3 pt-10">
          <p className="truncate text-sm font-medium text-white">
            {activeShot?.title ?? "Untitled"}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-neutral-300">
            Shot {shotIndex + 1} of {shots.length} · frame {frameInShot + 1}{" "}
            / {activeShot?.durationFrames ?? 0} · {durationSec}s @ {fps} fps
          </p>
        </div>
      </div>
    </Card>
  );
}
