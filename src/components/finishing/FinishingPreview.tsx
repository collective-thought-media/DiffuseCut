"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AudioTrack, Shot } from "@/lib/db/schema";
import { Card } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { frameAtTimelinePosition, totalProjectFrames } from "@/lib/timing/frames";
import { resolveTrackTiming } from "@/lib/finishing/audio-track-timing";
import {
  resolveShotPreviewLayer,
  type ShotPreviewLayer,
} from "@/lib/finishing/shot-preview-media";
import {
  activeOverlayTexts,
  isVideoAtShotEnd,
  shotVideoTimeSec,
} from "@/lib/finishing/video-sync";
import { effectiveTrimFrames } from "@/lib/finishing/trim";
import { mediaUrl } from "@/lib/media-url";
import type { TextOverlayDraft } from "@/components/export/OverlayEditor";

interface FinishingPreviewProps {
  projectId: string;
  shots: Shot[];
  currentFrame: number;
  fps: number;
  playing: boolean;
  overlays: TextOverlayDraft[];
  audioTracks: AudioTrack[];
  onVideoTimeUpdate?: (shotIndex: number, videoTimeSec: number) => void;
  onVideoShotEnd?: (shotIndex: number) => void;
}

function isVideoLayer(layer: ShotPreviewLayer): boolean {
  return layer.kind === "rendered-video" || layer.kind === "placeholder-video";
}

export function FinishingPreview({
  projectId,
  shots,
  currentFrame,
  fps,
  playing,
  overlays,
  audioTracks,
  onVideoTimeUpdate,
  onVideoShotEnd,
}: FinishingPreviewProps) {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const advanceGuardRef = useRef(false);
  const prevShotIndexRef = useRef(0);
  const prevPlayingRef = useRef(playing);

  const { shotIndex, frameInShot } = useMemo(
    () => frameAtTimelinePosition(shots, currentFrame),
    [shots, currentFrame]
  );

  const activeShot = shots[shotIndex] ?? null;

  const previewLayers = useMemo((): ShotPreviewLayer[] => {
    return shots.map((shot) => resolveShotPreviewLayer(projectId, shot));
  }, [projectId, shots]);

  const visibleOverlays = useMemo(
    () => activeOverlayTexts(overlays, currentFrame),
    [overlays, currentFrame]
  );

  const timelineTotalFrames = useMemo(
    () => totalProjectFrames(shots),
    [shots]
  );

  const activeLayer = previewLayers[shotIndex] ?? null;

  useEffect(() => {
    advanceGuardRef.current = false;
  }, [shotIndex]);

  const requestShotAdvance = useCallback(
    (index: number) => {
      if (!playing || index !== shotIndex || advanceGuardRef.current) return;
      advanceGuardRef.current = true;
      onVideoShotEnd?.(index);
    },
    [playing, shotIndex, onVideoShotEnd]
  );

  const seekVideoToFrame = useCallback(
    (index: number, frame: number) => {
      const layer = previewLayers[index];
      const video = videoRefs.current[index];
      const shot = shots[index];
      if (!video || !shot || !layer || !isVideoLayer(layer)) return;

      const targetTime = shotVideoTimeSec(shot, frame, fps);
      if (Math.abs(video.currentTime - targetTime) > 0.03) {
        try {
          video.currentTime = targetTime;
        } catch {
          /* media still loading */
        }
      }
    },
    [fps, previewLayers, shots]
  );

  const parkVideoAtTrimIn = useCallback(
    (index: number) => {
      const layer = previewLayers[index];
      const video = videoRefs.current[index];
      const shot = shots[index];
      if (!video || !shot || !layer || !isVideoLayer(layer)) return;

      const trimInSec = (shot.trimInFrames ?? 0) / fps;
      if (Math.abs(video.currentTime - trimInSec) > 0.03) {
        try {
          video.currentTime = trimInSec;
        } catch {
          /* media still loading */
        }
      }
    },
    [fps, previewLayers, shots]
  );

  useEffect(() => {
    const shotChanged = prevShotIndexRef.current !== shotIndex;
    const playStarted = playing && !prevPlayingRef.current;
    prevShotIndexRef.current = shotIndex;
    prevPlayingRef.current = playing;

    previewLayers.forEach((layer, index) => {
      const video = videoRefs.current[index];
      if (!video || !isVideoLayer(layer)) return;

      const isActive = index === shotIndex;
      const shot = shots[index];
      if (!isActive || !shot) {
        video.pause();
        parkVideoAtTrimIn(index);
        return;
      }

      if (!playing) {
        seekVideoToFrame(index, frameInShot);
        video.pause();
        return;
      }

      if (shotChanged || playStarted) {
        seekVideoToFrame(index, frameInShot);
        if (video.paused) {
          void video.play().catch(() => undefined);
        }
        return;
      }

      if (
        video.ended ||
        isVideoAtShotEnd(shot, video.currentTime, fps, video.duration)
      ) {
        video.pause();
        requestShotAdvance(index);
        return;
      }

      if (video.paused) {
        void video.play().catch(() => undefined);
      }
    });
  }, [
    shotIndex,
    frameInShot,
    fps,
    playing,
    previewLayers,
    shots,
    requestShotAdvance,
    seekVideoToFrame,
    parkVideoAtTrimIn,
  ]);

  useEffect(() => {
    const sfxActive = audioTracks.some((track) => {
      if (track.kind !== "sfx" || !track.filePath || track.filePath.includes("pending")) {
        return false;
      }
      const timing = resolveTrackTiming(track, shots, timelineTotalFrames);
      return currentFrame >= timing.startFrame && currentFrame < timing.endFrame;
    });

    audioTracks.forEach((track, index) => {
      const audio = audioRefs.current[index];
      if (!audio || !track.filePath || track.filePath.includes("pending")) {
        return;
      }

      const timing = resolveTrackTiming(track, shots, timelineTotalFrames);

      if (
        currentFrame < timing.startFrame ||
        currentFrame >= timing.endFrame
      ) {
        audio.pause();
        return;
      }

      const offsetSec = (currentFrame - timing.startFrame) / fps;
      let volume = Math.min(1, Math.max(0, track.volume));
      if (track.kind === "music" && sfxActive) {
        volume *= 0.42;
      }
      audio.volume = volume;

      if (playing && offsetSec >= 0) {
        if (Math.abs(audio.currentTime - offsetSec) > 0.12) {
          audio.currentTime = offsetSec;
        }
        void audio.play().catch(() => undefined);
      } else {
        audio.pause();
        if (offsetSec >= 0) {
          audio.currentTime = offsetSec;
        }
      }
    });
  }, [audioTracks, currentFrame, fps, playing, shots, timelineTotalFrames]);

  useEffect(() => {
    if (!playing) {
      audioRefs.current.forEach((audio) => audio?.pause());
    }
  }, [playing]);

  const handleTimeUpdate = (index: number) => {
    if (!playing || index !== shotIndex) return;
    const video = videoRefs.current[index];
    const shot = shots[index];
    if (!video || !shot) return;

    if (isVideoAtShotEnd(shot, video.currentTime, fps, video.duration)) {
      requestShotAdvance(index);
      return;
    }

    onVideoTimeUpdate?.(index, video.currentTime);
  };

  const handleEnded = (index: number) => {
    requestShotAdvance(index);
  };

  if (shots.length === 0) {
    return (
      <Card className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
        Add shots on the storyboard to preview the sequence.
      </Card>
    );
  }

  const durationSec = activeShot
    ? (activeShot.durationFrames / fps).toFixed(2)
    : "0.00";
  const trimOut = activeShot
    ? activeShot.trimOutFrames ?? activeShot.durationFrames
    : 0;
  const trimEffective = activeShot
    ? effectiveTrimFrames(activeShot.trimInFrames, trimOut)
    : 0;
  const sourceLabel =
    activeLayer?.kind === "rendered-video"
      ? "Rendered video"
      : activeLayer?.kind === "placeholder-image"
        ? "Storyboard still (no render yet)"
        : activeLayer?.kind === "placeholder-video"
          ? "Storyboard placeholder video"
          : "No media";

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative aspect-video w-full bg-black">
        {previewLayers.some((layer) => layer.src) ? (
          previewLayers.map((layer, index) => {
            if (!layer.src) return null;

            const isActive = index === shotIndex;

            if (isVideoLayer(layer)) {
              return (
                <video
                  key={`${layer.id}-${layer.src}`}
                  ref={(node) => {
                    videoRefs.current[index] = node;
                  }}
                  src={layer.src}
                  className={cn(
                    "absolute inset-0 h-full w-full object-contain",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                  muted
                  playsInline
                  preload="auto"
                  aria-hidden={!isActive}
                  onLoadedData={() => {
                    if (index !== shotIndex) {
                      parkVideoAtTrimIn(index);
                      return;
                    }
                    if (!playing) {
                      seekVideoToFrame(index, frameInShot);
                      return;
                    }
                    seekVideoToFrame(index, frameInShot);
                    const video = videoRefs.current[index];
                    if (video?.paused) {
                      void video.play().catch(() => undefined);
                    }
                  }}
                  onTimeUpdate={() => handleTimeUpdate(index)}
                  onEnded={() => handleEnded(index)}
                />
              );
            }

            return (
              <img
                key={`${layer.id}-${layer.src}`}
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
            <p className="text-xs">No media for this shot yet.</p>
          </div>
        )}

        {visibleOverlays.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/4 flex flex-col items-center gap-2 px-6">
            {visibleOverlays.map((text, index) => (
              <p
                key={`${text}-${index}`}
                className="max-w-[90%] rounded-md bg-black/70 px-4 py-2 text-center text-lg font-semibold text-white shadow-lg"
              >
                {text}
              </p>
            ))}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-3 pt-10">
          <p className="truncate text-sm font-medium text-white">
            {activeShot?.title ?? "Untitled"}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-neutral-300">
            Shot {shotIndex + 1} of {shots.length} · frame {frameInShot + 1}{" "}
            / {activeShot?.durationFrames ?? 0} · {durationSec}s @ {fps} fps ·{" "}
            In {activeShot?.trimInFrames ?? 0} · Out {trimOut} · {trimEffective}f
            effective · {sourceLabel}
          </p>
        </div>

        {audioTracks.map((track, index) =>
          track.filePath && !track.filePath.includes("pending") ? (
            <audio
              key={`${track.id}:${track.filePath}:${track.updatedAt}`}
              ref={(node) => {
                audioRefs.current[index] = node;
              }}
              src={mediaUrl(projectId, track.filePath, {
                version: track.updatedAt,
              })}
              preload="auto"
              className="hidden"
            />
          ) : null
        )}
      </div>
    </Card>
  );
}
