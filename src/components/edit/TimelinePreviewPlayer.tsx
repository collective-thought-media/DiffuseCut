"use client";

/**
 * NLE preview (AIMovieStudiov2 TimelineEditor model):
 * persistent base video, dissolve overlays, fade/wipe, multi-track video, timeline audio.
 */

import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/button";
import type { TimelineState } from "@/lib/timeline/types";
import { isVideoClip } from "@/lib/timeline/video-layout";
import { useTimelineNlePreview } from "@/components/edit/useTimelineNlePreview";

type Props = {
  timeline: TimelineState | null;
  timelineLoading?: boolean;
  currentFrame: number;
  fps: number;
  playing: boolean;
  onTimelineFrameChange: (frame: number) => void;
  onPlaybackEnd?: () => void;
};

export function TimelinePreviewPlayer({
  timeline,
  timelineLoading,
  currentFrame,
  fps,
  playing,
  onTimelineFrameChange,
  onPlaybackEnd,
}: Props) {
  const upperSrcRefs = useRef<Record<string, string | null>>({});
  const upperSeekRefs = useRef<Record<string, number | null>>({});

  const preview = useTimelineNlePreview({
    timeline,
    currentFrame,
    fps,
    playing,
    onTimelineFrameChange,
    onPlaybackEnd,
  });

  const {
    videoRef,
    secondaryVideoRef,
    activeBasePingPong,
    dissolveNextVideoRef,
    dissolvePrevVideoRef,
    dissolvePrevAudioRef,
    dissolveNextAudioRef,
    audioRefs,
    upperTrackVideoRefs,
    handleTimeUpdate,
    baseVisible,
    nextOverlay,
    prevOverlay,
    dissolveActive,
    isDissolveNextReady,
    isDissolvePrevReady,
    transitionOverlay,
    upperOverlays,
    displayLayout,
    playheadLayout,
  } = preview;

  useEffect(() => {
    if (!timeline || playing) return;
    for (const layout of upperOverlays) {
      const key = layout.clip.id;
      const v = upperTrackVideoRefs.current[key];
      if (!v) continue;
      if (!upperSrcRefs.current[key]) upperSrcRefs.current[key] = null;
      if (upperSeekRefs.current[key] === undefined) {
        upperSeekRefs.current[key] = null;
      }
      const srcRef = {
        get current() {
          return upperSrcRefs.current[key] ?? null;
        },
        set current(val: string | null) {
          upperSrcRefs.current[key] = val;
        },
      };
      const seekRef = {
        get current() {
          return upperSeekRefs.current[key] ?? null;
        },
        set current(val: number | null) {
          upperSeekRefs.current[key] = val;
        },
      };
      const targetTime =
        (layout.clip.trimInFrames +
          Math.max(0, currentFrame - layout.startFrame)) /
        fps;
      const nextSrc = layout.clip.sourceUrl;
      const isSame = srcRef.current === nextSrc;
      if (!isSame) {
        srcRef.current = nextSrc;
        seekRef.current = targetTime;
        v.src = nextSrc;
        v.load();
        v.onloadeddata = () => {
          try {
            v.currentTime = targetTime;
          } catch {
            /* ignore */
          }
        };
      } else if (
        seekRef.current === null ||
        Math.abs(seekRef.current - targetTime) > 0.05
      ) {
        seekRef.current = targetTime;
        try {
          v.currentTime = targetTime;
        } catch {
          /* ignore */
        }
      }
    }
  }, [currentFrame, fps, playing, timeline, upperOverlays, upperTrackVideoRefs]);

  if (timelineLoading || timeline == null) {
    return (
      <Card
        id="nle-preview-root"
        className="flex aspect-video items-center justify-center text-sm text-muted-foreground"
      >
        Loading timeline…
      </Card>
    );
  }

  const clip = displayLayout?.clip ?? null;

  if (!clip && upperOverlays.length === 0) {
    return (
      <Card
        id="nle-preview-root"
        className="flex aspect-video flex-col items-center justify-center gap-1 px-4 text-center text-sm text-muted-foreground"
      >
        <span>No clip at the playhead.</span>
        <span className="text-xs">
          Drag media from the library below onto V1–V3, or click a library item
          to insert at the playhead.
        </span>
        {timeline.audioTracks.map((t) => (
          <audio
            key={t.id}
            ref={(el) => {
              audioRefs.current[t.id] = el;
            }}
            preload="auto"
            className="hidden"
          />
        ))}
      </Card>
    );
  }

  const activeForLabel = playheadLayout?.clip ?? clip;
  const frameInClip = activeForLabel
    ? currentFrame - activeForLabel.startFrame
    : 0;
  const durationSec = activeForLabel
    ? (activeForLabel.durationFrames / fps).toFixed(2)
    : "0";

  if (activeForLabel && !isVideoClip(activeForLabel)) {
    return (
      <Card id="nle-preview-root" className="overflow-hidden p-0">
        <div className="relative aspect-video w-full bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeForLabel.sourceUrl}
            alt=""
            className="h-full w-full object-contain"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 text-xs text-neutral-200">
            {activeForLabel.name} · frame {frameInClip + 1} /{" "}
            {activeForLabel.durationFrames} · {durationSec}s @ {fps} fps · Still
          </div>
        </div>
        {timeline.audioTracks.map((t) => (
          <audio
            key={t.id}
            ref={(el) => {
              audioRefs.current[t.id] = el;
            }}
            preload="auto"
            className="hidden"
          />
        ))}
      </Card>
    );
  }

  const showPrimaryBase = baseVisible && activeBasePingPong === 0;
  const showSecondaryBase = baseVisible && activeBasePingPong === 1;
  const nextOpacity =
    !baseVisible && (isDissolveNextReady || !dissolveActive)
      ? (nextOverlay?.opacity ?? 1)
      : 0;
  const prevOpacity =
    !baseVisible && (isDissolvePrevReady || !dissolveActive)
      ? (prevOverlay?.opacity ?? 0)
      : 0;

  return (
    <Card id="nle-preview-root" className="overflow-hidden p-0">
      <div className="relative aspect-video w-full bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            opacity: showPrimaryBase ? 1 : 0,
            zIndex: showPrimaryBase ? 2 : 1,
          }}
          playsInline
          muted
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
        />
        <video
          ref={secondaryVideoRef}
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            opacity: showSecondaryBase ? 1 : 0,
            zIndex: showSecondaryBase ? 2 : 1,
          }}
          playsInline
          muted
          preload="auto"
        />
        {nextOverlay ? (
          <video
            ref={dissolveNextVideoRef}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ opacity: nextOpacity, zIndex: 2 }}
            playsInline
            muted
            preload="auto"
          />
        ) : null}
        {prevOverlay ? (
          <video
            ref={dissolvePrevVideoRef}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ opacity: prevOpacity, zIndex: 3 }}
            playsInline
            muted
            preload="auto"
          />
        ) : null}
        {upperOverlays.map((layout, i) => (
          <video
            key={layout.clip.id}
            ref={(el) => {
              upperTrackVideoRefs.current[layout.clip.id] = el;
            }}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ zIndex: 10 + i }}
            playsInline
            muted
            preload="auto"
          />
        ))}
        {transitionOverlay?.type === "fade" ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: 40,
              backgroundColor: transitionOverlay.color,
              opacity: transitionOverlay.opacity,
            }}
          />
        ) : null}
        {transitionOverlay?.type === "wipe" ? (
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{
              zIndex: 40,
              [transitionOverlay.side]: 0,
              width: `${transitionOverlay.widthPercent}%`,
              backgroundColor: transitionOverlay.color,
              opacity: transitionOverlay.opacity,
            }}
          />
        ) : null}
        <div className="absolute bottom-0 left-0 right-0 z-50 bg-black/70 px-3 py-2 text-xs text-neutral-200">
          {activeForLabel?.name ?? "Timeline"} · frame {frameInClip + 1} /{" "}
          {activeForLabel?.durationFrames ?? 0} · {durationSec}s @ {fps} fps
          {upperOverlays.length > 0
            ? ` · ${upperOverlays.length} overlay track clip(s)`
            : ""}
        </div>
      </div>
      {timeline.audioTracks.map((t) => (
        <audio
          key={t.id}
          ref={(el) => {
            audioRefs.current[t.id] = el;
          }}
          preload="auto"
          className="hidden"
        />
      ))}
      <audio ref={dissolvePrevAudioRef} preload="auto" className="hidden" />
      <audio ref={dissolveNextAudioRef} preload="auto" className="hidden" />
    </Card>
  );
}
