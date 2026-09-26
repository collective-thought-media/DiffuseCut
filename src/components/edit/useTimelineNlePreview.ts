"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { TimelineState } from "@/lib/timeline/types";
import {
  audioMediaTimeSecAtFrame,
  buildAudioTrackLayouts,
  findAudioClipAtFrame,
  trackVolume,
  type AudioTrackLayout,
} from "@/lib/timeline/audio-layout";
import {
  computeDissolvePreview,
  primaryLayoutAtFrame,
  type DissolvePreviewState,
} from "@/lib/timeline/dissolve-preview";
import { timelineContentEndFrame } from "@/lib/timeline/playhead";
import {
  computeTransitionOverlay,
  dissolveOffsetSecondsAtCut,
  type FadeWipeOverlay,
} from "@/lib/timeline/transition-overlay-preview";
import {
  embeddedAudioGroupId,
  isEmbeddedAudioClip,
} from "@/lib/timeline/embedded-audio-sync";
import {
  buildPrimaryVideoLayout,
  isVideoClip,
  layoutAtTimelineFrame,
  mediaTimeSecForTimelineFrame,
  overlayVideoLayoutsAtFrame,
  resolveMediaElementUrl,
  type TimelineClipLayout,
} from "@/lib/timeline/video-layout";

type Options = {
  timeline: TimelineState | null;
  currentFrame: number;
  fps: number;
  playing: boolean;
  onTimelineFrameChange: (frame: number) => void;
  onPlaybackEnd?: () => void;
};

export function useTimelineNlePreview({
  timeline,
  currentFrame,
  fps,
  playing,
  onTimelineFrameChange,
  onPlaybackEnd,
}: Options) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Second base layer for gapless hard cuts (decode on hidden, swap at trim-out). */
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const dissolveNextVideoRef = useRef<HTMLVideoElement>(null);
  const dissolvePrevVideoRef = useRef<HTMLVideoElement>(null);
  const dissolvePrevAudioRef = useRef<HTMLAudioElement>(null);
  const dissolveNextAudioRef = useRef<HTMLAudioElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const upperTrackVideoRefs = useRef<Record<string, HTMLVideoElement | null>>(
    {}
  );

  const lastPreviewVideoSrcRef = useRef<string | null>(null);
  const lastSeekMediaTimeRef = useRef<number | null>(null);
  const lastPreviewVideoSrcSecondaryRef = useRef<string | null>(null);
  const lastSeekMediaTimeSecondaryRef = useRef<number | null>(null);
  /** 0 = videoRef visible for base; 1 = secondaryVideoRef visible. */
  const activeBasePingPongRef = useRef(0);
  const preloadedLayoutIndexRef = useRef<number | null>(null);
  const preloadInFlightRef = useRef(false);
  const lastDissolveNextVideoSrcRef = useRef<string | null>(null);
  const lastDissolvePrevVideoSrcRef = useRef<string | null>(null);
  const lastDissolvePrevAudioSrcRef = useRef<string | null>(null);
  const lastDissolveNextAudioSrcRef = useRef<string | null>(null);
  const playingLayoutIndexRef = useRef<number | null>(null);
  const playbackOffsetSecRef = useRef(0);
  const isPlayingSequenceRef = useRef(false);
  const currentFrameRef = useRef(currentFrame);
  const playingRef = useRef(playing);
  const audioOnlyRafRef = useRef<number | null>(null);
  const playingAudioClipIdByTrackRef = useRef<Record<string, string | null>>(
    {}
  );
  const compositingLatchRef = useRef(false);
  const lastDissolveActiveRef = useRef(false);
  const timelineRef = useRef(timeline);
  const onTimelineFrameChangeRef = useRef(onTimelineFrameChange);
  const lastUiFrameReportRef = useRef<number | null>(null);
  const playSessionRef = useRef(0);
  const clipAdvanceInFlightRef = useRef(false);
  const videoPlayheadRafRef = useRef<number | null>(null);
  const stillPlaybackRafRef = useRef<number | null>(null);
  const dissolveActiveRef = useRef(false);
  const shouldCompositeNowRef = useRef(false);
  const isDissolveCompositingRef = useRef(false);
  const startPlaybackFromIndexRef = useRef<
    (
      index: number,
      startAtFrame?: number,
      seekOffsetSec?: number
    ) => Promise<void>
  >(async () => undefined);
  const advanceToNextLayoutRef = useRef<
    (currentIndex: number, timelineFrame: number) => void
  >(() => undefined);
  const runVideoPlayheadRafLoopRef = useRef<() => void>(() => undefined);
  const startAudioOnlyFromFrameRef = useRef<(startFrame: number) => void>(
    () => undefined
  );

  timelineRef.current = timeline;
  onTimelineFrameChangeRef.current = onTimelineFrameChange;

  const [isDissolveNextReady, setIsDissolveNextReady] = useState(false);
  const [isDissolvePrevReady, setIsDissolvePrevReady] = useState(false);
  const [baseReadyAfterCut, setBaseReadyAfterCut] = useState(true);
  const [isDissolveCompositing, setIsDissolveCompositing] = useState(false);
  const [activeBasePingPong, setActiveBasePingPong] = useState(0);

  const PRELOAD_LEAD_SEC = 0.45;

  const refsForBaseVideo = useCallback((video: HTMLVideoElement) => {
    if (video === videoRef.current) {
      return {
        srcRef: lastPreviewVideoSrcRef,
        seekRef: lastSeekMediaTimeRef,
      };
    }
    return {
      srcRef: lastPreviewVideoSrcSecondaryRef,
      seekRef: lastSeekMediaTimeSecondaryRef,
    };
  }, []);

  const getActiveBaseVideo = useCallback(() => {
    return activeBasePingPongRef.current === 0
      ? videoRef.current
      : secondaryVideoRef.current;
  }, []);

  const getStandbyBaseVideo = useCallback(() => {
    return activeBasePingPongRef.current === 0
      ? secondaryVideoRef.current
      : videoRef.current;
  }, []);

  const resetBasePingPongToPrimary = useCallback(() => {
    activeBasePingPongRef.current = 0;
    setActiveBasePingPong(0);
    preloadedLayoutIndexRef.current = null;
    preloadInFlightRef.current = false;
    secondaryVideoRef.current?.pause();
  }, []);

  const v1Layout = useMemo(
    () => (timeline ? buildPrimaryVideoLayout(timeline) : []),
    [timeline]
  );
  const v1LayoutRef = useRef(v1Layout);
  v1LayoutRef.current = v1Layout;

  const v1MediaFingerprint = useMemo(
    () =>
      v1Layout
        .map(
          (l) =>
            `${l.clip.id}:${l.clip.sourceRef}:${l.clip.sourceUrl}:${l.startFrame}:${l.endFrame}`
        )
        .join("|"),
    [v1Layout]
  );

  const audioTrackLayouts = useMemo(
    () => (timeline ? buildAudioTrackLayouts(timeline) : []),
    [timeline]
  );

  const playheadLayout = useMemo(
    () => primaryLayoutAtFrame(v1Layout, currentFrame),
    [v1Layout, currentFrame]
  );

  const dissolveOverlay: DissolvePreviewState | null = useMemo(() => {
    if (!timeline) return null;
    return computeDissolvePreview({
      fps,
      playheadFrame: currentFrame,
      v1Layout,
      audioTracks: timeline.audioTracks,
    });
  }, [currentFrame, fps, timeline, v1Layout]);

  const nextOverlay = dissolveOverlay?.next ?? null;
  const prevOverlay = dissolveOverlay?.prev ?? null;
  const dissolveActive = dissolveOverlay?.active ?? false;
  const dissolveTRelSeconds = dissolveOverlay?.tRelSeconds ?? null;
  const hideBaseAroundCut =
    typeof dissolveTRelSeconds === "number" &&
    Math.abs(dissolveTRelSeconds) < 0.08;

  const shouldCompositeNow =
    dissolveActive &&
    !!nextOverlay &&
    !!prevOverlay &&
    nextOverlay.active &&
    prevOverlay.active &&
    isDissolveNextReady &&
    isDissolvePrevReady;

  if (shouldCompositeNow) compositingLatchRef.current = true;
  if (!dissolveActive && baseReadyAfterCut) compositingLatchRef.current = false;

  const isCompositing = compositingLatchRef.current;

  useEffect(() => {
    setIsDissolveCompositing(isCompositing);
    isDissolveCompositingRef.current = isCompositing;
  }, [isCompositing]);

  useEffect(() => {
    dissolveActiveRef.current = dissolveActive;
  }, [dissolveActive]);

  useEffect(() => {
    shouldCompositeNowRef.current = shouldCompositeNow;
  }, [shouldCompositeNow]);

  useEffect(() => {
    if (!dissolveActive && !baseReadyAfterCut) {
      const t = window.setTimeout(() => setBaseReadyAfterCut(true), 2000);
      return () => window.clearTimeout(t);
    }
  }, [baseReadyAfterCut, dissolveActive]);

  const baseVisible =
    !hideBaseAroundCut &&
    !shouldCompositeNow &&
    (!isCompositing || (!dissolveActive && baseReadyAfterCut));

  const transitionOverlay: FadeWipeOverlay | null = useMemo(() => {
    if (!playheadLayout) return null;
    return computeTransitionOverlay({
      fps,
      playheadFrame: currentFrame,
      layout: playheadLayout,
    });
  }, [currentFrame, fps, playheadLayout]);

  const upperOverlays = useMemo(() => {
    if (!timeline) return [];
    return overlayVideoLayoutsAtFrame(timeline, currentFrame);
  }, [currentFrame, timeline]);

  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    if (!timeline) return;
    for (const track of timeline.audioTracks) {
      const a = audioRefs.current[track.id];
      if (!a) continue;
      a.volume = trackVolume(track);
    }
  }, [timeline?.audioTracks, timeline]);

  /** Push playhead to React state without restarting the video decoder every tick. */
  const reportTimelineFrame = useCallback((frame: number) => {
    if (lastUiFrameReportRef.current === frame) return;
    lastUiFrameReportRef.current = frame;
    currentFrameRef.current = frame;
    onTimelineFrameChangeRef.current(frame);
  }, []);

  const cancelPlaybackRafs = useCallback(() => {
    if (videoPlayheadRafRef.current != null) {
      cancelAnimationFrame(videoPlayheadRafRef.current);
      videoPlayheadRafRef.current = null;
    }
    if (stillPlaybackRafRef.current != null) {
      cancelAnimationFrame(stillPlaybackRafRef.current);
      stillPlaybackRafRef.current = null;
    }
    if (audioOnlyRafRef.current != null) {
      cancelAnimationFrame(audioOnlyRafRef.current);
      audioOnlyRafRef.current = null;
    }
  }, []);

  const stopSequence = useCallback(() => {
    isPlayingSequenceRef.current = false;
    playingLayoutIndexRef.current = null;
    playbackOffsetSecRef.current = 0;
    clipAdvanceInFlightRef.current = false;
    preloadedLayoutIndexRef.current = null;
    preloadInFlightRef.current = false;
    cancelPlaybackRafs();
    videoRef.current?.pause();
    secondaryVideoRef.current?.pause();
    dissolveNextVideoRef.current?.pause();
    dissolvePrevVideoRef.current?.pause();
    dissolvePrevAudioRef.current?.pause();
    dissolveNextAudioRef.current?.pause();
    for (const a of Object.values(audioRefs.current)) {
      a?.pause();
    }
  }, [cancelPlaybackRafs]);

  useEffect(() => {
    lastPreviewVideoSrcRef.current = null;
    lastSeekMediaTimeRef.current = null;
    lastPreviewVideoSrcSecondaryRef.current = null;
    lastSeekMediaTimeSecondaryRef.current = null;
    preloadedLayoutIndexRef.current = null;
    preloadInFlightRef.current = false;
    resetBasePingPongToPrimary();
    stopSequence();
  }, [v1MediaFingerprint, resetBasePingPongToPrimary, stopSequence]);

  const findAudioClipAtTimeInTrack = useCallback(
    (trackId: string, frame: number) => {
      const layout = audioTrackLayouts.find((t) => t.trackId === trackId);
      if (!layout) return null;
      return findAudioClipAtFrame(layout, frame);
    },
    [audioTrackLayouts]
  );

  const setAllBaseVideosMuted = useCallback((muted: boolean) => {
    if (videoRef.current) videoRef.current.muted = muted;
    if (secondaryVideoRef.current) secondaryVideoRef.current.muted = muted;
  }, []);

  const updateVideoMuteForFrame = useCallback(
    (
      frame: number,
      videoClip: TimelineClipLayout["clip"] | null,
      videoTrackId?: string
    ) => {
      if (!timeline) return;

      if (
        dissolveActiveRef.current ||
        shouldCompositeNowRef.current ||
        isDissolveCompositingRef.current
      ) {
        setAllBaseVideosMuted(true);
        return;
      }

      void frame;
      void videoTrackId;

      // Preview audio is always routed through timeline audio lanes, never the video tag.
      setAllBaseVideosMuted(true);
    },
    [setAllBaseVideosMuted, timeline]
  );

  const syncDissolveAudio = useCallback(
    async (
      a: HTMLAudioElement,
      lastSrcRef: MutableRefObject<string | null>,
      overlay: {
        src: string;
        timeSeconds: number;
        volume: number;
      } | null,
      enabled: boolean
    ) => {
      if (!enabled || !overlay) {
        a.pause();
        return;
      }
      a.volume = Math.max(0, Math.min(1, overlay.volume));
      a.muted = false;
      const nextSrc = overlay.src;
      const domHasSrc =
        (a.currentSrc && a.currentSrc.length > 0) ||
        (a.src && a.src.length > 0);
      const isSameSrc = lastSrcRef.current === nextSrc && domHasSrc;
      if (!isSameSrc) {
        lastSrcRef.current = nextSrc;
        a.pause();
        a.src = nextSrc;
        a.load();
        if (a.readyState < 1) {
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(
              () => reject(new Error("Audio load timeout")),
              7000
            );
            const done = () => {
              window.clearTimeout(timeout);
              resolve();
            };
            a.addEventListener("loadedmetadata", done, { once: true });
            a.addEventListener("error", () => {
              window.clearTimeout(timeout);
              reject(new Error("Audio load error"));
            });
          }).catch(() => undefined);
        }
      }
      const targetTime = Math.max(0, overlay.timeSeconds);
      if (Math.abs((a.currentTime ?? 0) - targetTime) > 0.15) {
        try {
          a.currentTime = targetTime;
        } catch {
          /* ignore */
        }
      }
      if (isPlayingSequenceRef.current) {
        try {
          await a.play();
        } catch {
          /* ignore */
        }
      } else {
        a.pause();
      }
    },
    []
  );

  const syncAudioTrackAtFrame = useCallback(
    async (trackLayout: AudioTrackLayout, frame: number) => {
      const a = audioRefs.current[trackLayout.trackId];
      if (!a || !timeline) return;

      const track = timeline.audioTracks.find(
        (t) => t.id === trackLayout.trackId
      );
      a.volume = track ? trackVolume(track) : 1;

      if (track?.muted) {
        a.pause();
        playingAudioClipIdByTrackRef.current[trackLayout.trackId] = null;
        return;
      }

      const found = findAudioClipAtFrame(trackLayout, frame);
      if (!found) {
        a.pause();
        playingAudioClipIdByTrackRef.current[trackLayout.trackId] = null;
        return;
      }

      if (dissolveActive || shouldCompositeNow || isDissolveCompositing) {
        const gid = found.clip.groupId;
        const prevGid = prevOverlay?.groupId ?? null;
        const nextGid = nextOverlay?.groupId ?? null;
        const isLinked =
          (typeof gid === "string" &&
            ((prevGid && gid === prevGid) || (nextGid && gid === nextGid))) ||
          (!gid &&
            ((prevOverlay?.src &&
              found.clip.sourceUrl === prevOverlay.src) ||
              (nextOverlay?.src &&
                found.clip.sourceUrl === nextOverlay.src)));
        if (isLinked) {
          a.pause();
          playingAudioClipIdByTrackRef.current[trackLayout.trackId] = null;
          return;
        }
      }

      const { clip, layout } = found;
      const mediaTime = audioMediaTimeSecAtFrame(clip, layout, frame, fps);
      const playingId =
        playingAudioClipIdByTrackRef.current[trackLayout.trackId] ?? null;
      if (playingId === clip.id && !a.paused) return;

      try {
        a.pause();
        if (a.src !== clip.sourceUrl) {
          a.src = clip.sourceUrl;
          a.load();
        }
        a.currentTime = Math.max(0, mediaTime);
        if (isPlayingSequenceRef.current) {
          await a.play();
        }
        playingAudioClipIdByTrackRef.current[trackLayout.trackId] = clip.id;
      } catch {
        playingAudioClipIdByTrackRef.current[trackLayout.trackId] = null;
      }
    },
    [
      dissolveActive,
      fps,
      isDissolveCompositing,
      nextOverlay?.groupId,
      nextOverlay?.src,
      prevOverlay?.groupId,
      prevOverlay?.src,
      shouldCompositeNow,
      timeline,
    ]
  );

  const syncAllAudioAtFrame = useCallback(
    async (frame: number) => {
      await Promise.all(
        audioTrackLayouts.map((t) => syncAudioTrackAtFrame(t, frame))
      );
    },
    [audioTrackLayouts, syncAudioTrackAtFrame]
  );

  const applyVideoSourceAndSeek = useCallback(
    (
      video: HTMLVideoElement,
      targetLayout: TimelineClipLayout,
      timelineFrame: number,
      srcRef: MutableRefObject<string | null>,
      seekRef: MutableRefObject<number | null>
    ) => {
      if (!isVideoClip(targetLayout.clip)) return;
      const targetTime = mediaTimeSecForTimelineFrame(
        targetLayout.clip,
        timelineFrame,
        fps
      );
      const nextSrc = targetLayout.clip.sourceUrl;
      const resolvedNext = resolveMediaElementUrl(nextSrc);
      const resolvedCurrent = video.src
        ? resolveMediaElementUrl(video.src)
        : "";

      const isSameSrc =
        srcRef.current === nextSrc || resolvedCurrent === resolvedNext;

      if (!isSameSrc) {
        srcRef.current = nextSrc;
        seekRef.current = targetTime;
        const applySeek = () => {
          try {
            video.currentTime = Math.max(0, targetTime);
          } catch {
            /* not ready */
          }
        };
        const onLoaded = () => {
          video.removeEventListener("loadeddata", onLoaded);
          video.removeEventListener("loadedmetadata", onLoaded);
          applySeek();
        };
        video.addEventListener("loadedmetadata", onLoaded);
        video.addEventListener("loadeddata", onLoaded);
        video.src = nextSrc;
        video.load();
        return;
      }

      if (
        seekRef.current === null ||
        Math.abs(seekRef.current - targetTime) > 0.05
      ) {
        seekRef.current = targetTime;
        try {
          video.currentTime = Math.max(0, targetTime);
        } catch {
          /* not ready */
        }
      }
    },
    [fps]
  );

  const waitVideoCanShowFrame = useCallback(
    (video: HTMLVideoElement, timeoutMs = 10000) =>
      new Promise<void>((resolve, reject) => {
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        const timeout = window.setTimeout(
          () => reject(new Error("Video decode timeout")),
          timeoutMs
        );
        const done = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        video.addEventListener("loadeddata", done, { once: true });
        video.addEventListener("canplay", done, { once: true });
        video.addEventListener("error", done, { once: true });
      }),
    []
  );

  const mediaStartSecForLayout = useCallback(
    (
      layout: TimelineClipLayout,
      startFrame: number,
      seekOffsetSec: number,
      video: HTMLVideoElement
    ) => {
      const trimOutFrames =
        layout.clip.trimOutFrames ??
        layout.clip.trimInFrames + layout.clip.durationFrames;
      const trimOutSec = trimOutFrames / fps;
      const rawStartAt =
        mediaTimeSecForTimelineFrame(layout.clip, startFrame, fps) +
        seekOffsetSec;
      const maxT = Number.isFinite(video.duration)
        ? Math.max(0, video.duration - 0.02)
        : Math.max(0, trimOutSec - 0.02);
      return Math.min(Math.max(0, rawStartAt), maxT);
    },
    [fps]
  );

  /** Decode next clip on the hidden base element; stay paused until swap. */
  const prepareStandbyForClipIndex = useCallback(
    async (
      index: number,
      startAtFrame?: number,
      seekOffsetSec?: number
    ): Promise<boolean> => {
      const standby = getStandbyBaseVideo();
      if (!standby) return false;
      const layout = v1LayoutRef.current[index];
      if (!layout || !isVideoClip(layout.clip)) return false;

      const startFrame =
        typeof startAtFrame === "number"
          ? Math.max(
              layout.startFrame,
              Math.min(layout.endFrame - 1, startAtFrame)
            )
          : layout.startFrame;
      const seekOff = seekOffsetSec ?? 0;
      const { srcRef, seekRef } = refsForBaseVideo(standby);

      standby.muted = true;
      standby.pause();
      applyVideoSourceAndSeek(
        standby,
        layout,
        startFrame,
        srcRef,
        seekRef
      );

      try {
        await waitVideoCanShowFrame(standby);
      } catch {
        return false;
      }

      const startAt = mediaStartSecForLayout(
        layout,
        startFrame,
        seekOff,
        standby
      );
      try {
        standby.currentTime = startAt;
      } catch {
        try {
          standby.currentTime = 0;
        } catch {
          return false;
        }
      }

      try {
        await waitVideoCanShowFrame(standby);
      } catch {
        return false;
      }

      preloadedLayoutIndexRef.current = index;
      return true;
    },
    [
      applyVideoSourceAndSeek,
      getStandbyBaseVideo,
      mediaStartSecForLayout,
      refsForBaseVideo,
      waitVideoCanShowFrame,
    ]
  );

  const swapStandbyToActive = useCallback(
    async (
      index: number,
      startFrame: number,
      seekOffsetSec: number
    ): Promise<boolean> => {
      const layout = v1LayoutRef.current[index];
      const oldActive = getActiveBaseVideo();
      const newActive = getStandbyBaseVideo();
      if (!layout || !newActive || !isVideoClip(layout.clip)) return false;

      oldActive?.pause();

      activeBasePingPongRef.current =
        activeBasePingPongRef.current === 0 ? 1 : 0;
      setActiveBasePingPong(activeBasePingPongRef.current);

      playingLayoutIndexRef.current = index;
      playbackOffsetSecRef.current = seekOffsetSec;
      preloadedLayoutIndexRef.current = null;

      const startAt = mediaStartSecForLayout(
        layout,
        startFrame,
        seekOffsetSec,
        newActive
      );
      try {
        newActive.currentTime = startAt;
      } catch {
        /* ignore */
      }

      try {
        await newActive.play();
      } catch {
        return false;
      }

      reportTimelineFrame(startFrame);
      void syncAllAudioAtFrame(startFrame);
      updateVideoMuteForFrame(startFrame, layout.clip, layout.trackId);
      return true;
    },
    [
      getActiveBaseVideo,
      getStandbyBaseVideo,
      mediaStartSecForLayout,
      reportTimelineFrame,
      syncAllAudioAtFrame,
      updateVideoMuteForFrame,
    ]
  );

  const syncOverlayVideo = useCallback(
    async (
      v: HTMLVideoElement,
      lastSrcRef: MutableRefObject<string | null>,
      overlay: { src: string; timeSeconds: number } | null,
      setReady: (ready: boolean) => void
    ) => {
      if (!overlay) {
        setReady(false);
        return;
      }
      v.muted = true;
      const nextSrc = overlay.src;
      const targetTime = Math.max(0, overlay.timeSeconds);
      const domHasSrc =
        (v.currentSrc && v.currentSrc.length > 0) ||
        (v.src && v.src.length > 0);
      const isSameSrc = lastSrcRef.current === nextSrc && domHasSrc;
      if (!isSameSrc) {
        lastSrcRef.current = nextSrc;
        setReady(false);
        v.pause();
        v.src = nextSrc;
        v.load();
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          v.addEventListener("loadeddata", done, { once: true });
          v.addEventListener("error", done, { once: true });
        });
        try {
          v.currentTime = targetTime;
        } catch {
          /* ignore */
        }
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve())
        );
        setReady(true);
      } else {
        if (Math.abs((v.currentTime ?? 0) - targetTime) > 0.05) {
          try {
            v.currentTime = targetTime;
          } catch {
            /* ignore */
          }
        }
        setReady(true);
      }
      if (isPlayingSequenceRef.current) {
        try {
          await v.play();
        } catch {
          /* ignore */
        }
      } else {
        v.pause();
      }
    },
    []
  );

  const seekToTimelineFrame = useCallback(
    (timelineFrame: number) => {
      if (!timeline) return;
      resetBasePingPongToPrimary();
      const targetLayout = primaryLayoutAtFrame(v1Layout, timelineFrame);
      if (!targetLayout || !isVideoClip(targetLayout.clip)) {
        videoRef.current?.pause();
        secondaryVideoRef.current?.pause();
        return;
      }
      videoRef.current?.pause();
      secondaryVideoRef.current?.pause();
      applyVideoSourceAndSeek(
        videoRef.current!,
        targetLayout,
        timelineFrame,
        lastPreviewVideoSrcRef,
        lastSeekMediaTimeRef
      );
      void syncAllAudioAtFrame(timelineFrame);
      updateVideoMuteForFrame(timelineFrame, targetLayout.clip);
    },
    [
      applyVideoSourceAndSeek,
      resetBasePingPongToPrimary,
      syncAllAudioAtFrame,
      timeline,
      updateVideoMuteForFrame,
      v1Layout,
    ]
  );

  const runVideoPlayheadRafLoop = useCallback(() => {
    if (videoPlayheadRafRef.current != null) {
      cancelAnimationFrame(videoPlayheadRafRef.current);
      videoPlayheadRafRef.current = null;
    }

    const tickFromVideo = () => {
      if (!isPlayingSequenceRef.current) return;
      const idx = playingLayoutIndexRef.current;
      const v = getActiveBaseVideo();
      if (idx === null || !v) return;

      const activeLayout = v1LayoutRef.current[idx];
      if (!activeLayout || !isVideoClip(activeLayout.clip)) return;

      const trimInSec = activeLayout.clip.trimInFrames / fps;
      const localSec =
        Math.max(0, v.currentTime - trimInSec) -
        playbackOffsetSecRef.current;
      const timelineFrame = Math.min(
        activeLayout.endFrame - 1,
        Math.max(
          activeLayout.startFrame,
          activeLayout.startFrame + Math.floor(localSec * fps)
        )
      );

      reportTimelineFrame(timelineFrame);
      updateVideoMuteForFrame(
        timelineFrame,
        activeLayout.clip,
        activeLayout.trackId
      );

      const activeTrimOut =
        (activeLayout.clip.trimOutFrames ??
          activeLayout.clip.trimInFrames +
            activeLayout.clip.durationFrames) / fps;

      const timeToTrimOut = activeTrimOut - v.currentTime;
      const layouts = v1LayoutRef.current;
      const nextIdx = idx + 1;
      if (
        nextIdx < layouts.length &&
        !clipAdvanceInFlightRef.current &&
        !preloadInFlightRef.current &&
        preloadedLayoutIndexRef.current !== nextIdx &&
        timeToTrimOut <= PRELOAD_LEAD_SEC &&
        timeToTrimOut > 0.05
      ) {
        preloadInFlightRef.current = true;
        void prepareStandbyForClipIndex(nextIdx).finally(() => {
          preloadInFlightRef.current = false;
        });
      }

      if (v.currentTime >= activeTrimOut - 0.04) {
        advanceToNextLayoutRef.current(idx, timelineFrame);
        return;
      }

      videoPlayheadRafRef.current = requestAnimationFrame(tickFromVideo);
    };

    videoPlayheadRafRef.current = requestAnimationFrame(tickFromVideo);
  }, [
    PRELOAD_LEAD_SEC,
    fps,
    getActiveBaseVideo,
    prepareStandbyForClipIndex,
    reportTimelineFrame,
    updateVideoMuteForFrame,
  ]);

  runVideoPlayheadRafLoopRef.current = runVideoPlayheadRafLoop;

  const advanceToNextLayout = useCallback(
    (currentIndex: number, timelineFrame: number) => {
      if (clipAdvanceInFlightRef.current) return;
      const layouts = v1LayoutRef.current;
      const nextIndex = currentIndex + 1;
      const tl = timelineRef.current;
      const endFrame = tl ? timelineContentEndFrame(tl) : timelineFrame;

      if (nextIndex >= layouts.length) {
        if (timelineFrame < endFrame - 1) {
          getActiveBaseVideo()?.pause();
          playingLayoutIndexRef.current = null;
          startAudioOnlyFromFrameRef.current(timelineFrame);
          return;
        }
        stopSequence();
        onPlaybackEnd?.();
        return;
      }

      const layout = layouts[currentIndex]!;
      let nextIndexResolved = nextIndex;
      while (
        nextIndexResolved < layouts.length &&
        layouts[nextIndexResolved]!.startFrame < layout.endFrame - 1
      ) {
        nextIndexResolved += 1;
      }
      if (nextIndexResolved >= layouts.length) {
        if (timelineFrame < endFrame - 1) {
          getActiveBaseVideo()?.pause();
          playingLayoutIndexRef.current = null;
          startAudioOnlyFromFrameRef.current(timelineFrame);
          return;
        }
        stopSequence();
        onPlaybackEnd?.();
        return;
      }

      const nextLayout = layouts[nextIndexResolved]!;
      const offset = dissolveOffsetSecondsAtCut(layout.clip, nextLayout.clip);
      const seekOff = offset > 0 ? offset : 0;
      const nextStartFrame = nextLayout.startFrame;

      clipAdvanceInFlightRef.current = true;

      const handoff = async () => {
        try {
          const alreadyPreloaded =
            preloadedLayoutIndexRef.current === nextIndexResolved;
          if (!alreadyPreloaded) {
            const ok = await prepareStandbyForClipIndex(
              nextIndexResolved,
              nextStartFrame,
              seekOff > 0 ? seekOff : undefined
            );
            if (!ok) {
              resetBasePingPongToPrimary();
              await startPlaybackFromIndexRef.current(
                nextIndexResolved,
                nextStartFrame,
                seekOff > 0 ? seekOff : undefined
              );
              return;
            }
          }

          const swapped = await swapStandbyToActive(
            nextIndexResolved,
            nextStartFrame,
            seekOff
          );
          if (swapped) {
            runVideoPlayheadRafLoopRef.current();
          } else {
            resetBasePingPongToPrimary();
            await startPlaybackFromIndexRef.current(
              nextIndexResolved,
              nextStartFrame,
              seekOff > 0 ? seekOff : undefined
            );
          }
        } finally {
          clipAdvanceInFlightRef.current = false;
        }
      };

      void handoff();
    },
    [
      getActiveBaseVideo,
      onPlaybackEnd,
      prepareStandbyForClipIndex,
      resetBasePingPongToPrimary,
      stopSequence,
      swapStandbyToActive,
    ]
  );

  advanceToNextLayoutRef.current = advanceToNextLayout;

  const startStillPlaybackFromIndex = useCallback(
    (index: number, startAtFrame?: number) => {
      const layout = v1LayoutRef.current[index];
      if (!layout) return;

      cancelPlaybackRafs();
      videoRef.current?.pause();
      isPlayingSequenceRef.current = true;
      playingLayoutIndexRef.current = index;

      const startFrame =
        typeof startAtFrame === "number"
          ? Math.max(
              layout.startFrame,
              Math.min(layout.endFrame - 1, startAtFrame)
            )
          : layout.startFrame;

      const durationSec = layout.clip.durationFrames / fps;
      const elapsedOffsetSec = Math.max(0, (startFrame - layout.startFrame) / fps);
      const startedAt = performance.now() - elapsedOffsetSec * 1000;
      const tl = timelineRef.current;
      const endFrame = tl ? timelineContentEndFrame(tl) : layout.endFrame;

      reportTimelineFrame(startFrame);
      void syncAllAudioAtFrame(startFrame);
      updateVideoMuteForFrame(startFrame, layout.clip, layout.trackId);

      const tick = () => {
        if (!isPlayingSequenceRef.current) return;
        const elapsed = (performance.now() - startedAt) / 1000;
        const nextFrame = Math.min(
          layout.endFrame - 1,
          layout.startFrame + Math.floor(elapsed * fps)
        );
        reportTimelineFrame(nextFrame);
        void syncAllAudioAtFrame(nextFrame);
        updateVideoMuteForFrame(nextFrame, layout.clip, layout.trackId);

        if (nextFrame >= endFrame - 1) {
          stillPlaybackRafRef.current = null;
          stopSequence();
          onPlaybackEnd?.();
          return;
        }

        if (elapsed >= durationSec - 0.001) {
          stillPlaybackRafRef.current = null;
          advanceToNextLayout(index, nextFrame);
          return;
        }

        stillPlaybackRafRef.current = requestAnimationFrame(tick);
      };

      stillPlaybackRafRef.current = requestAnimationFrame(tick);
    },
    [
      advanceToNextLayout,
      cancelPlaybackRafs,
      fps,
      onPlaybackEnd,
      reportTimelineFrame,
      stopSequence,
      syncAllAudioAtFrame,
      updateVideoMuteForFrame,
    ]
  );

  const startPlaybackFromIndex = useCallback(
    async (
      index: number,
      startAtFrame?: number,
      seekOffsetSec?: number
    ) => {
      if (!timelineRef.current) return;
      const layout = v1LayoutRef.current[index];
      if (!layout) return;

      if (!isVideoClip(layout.clip)) {
        startStillPlaybackFromIndex(index, startAtFrame);
        return;
      }

      resetBasePingPongToPrimary();
      const video = videoRef.current;
      if (!video) return;

      cancelPlaybackRafs();
      isPlayingSequenceRef.current = true;
      playingLayoutIndexRef.current = index;

      const startFrame =
        typeof startAtFrame === "number"
          ? Math.max(
              layout.startFrame,
              Math.min(layout.endFrame - 1, startAtFrame)
            )
          : layout.startFrame;

      const seekOff = seekOffsetSec ?? 0;
      playbackOffsetSecRef.current = seekOff;

      applyVideoSourceAndSeek(
        video,
        layout,
        startFrame,
        lastPreviewVideoSrcRef,
        lastSeekMediaTimeRef
      );

      try {
        await waitVideoCanShowFrame(video);
      } catch {
        /* continue */
      }

      const startAt = mediaStartSecForLayout(
        layout,
        startFrame,
        seekOff,
        video
      );

      try {
        video.currentTime = startAt;
      } catch {
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
      }

      try {
        await video.play();
      } catch {
        stopSequence();
        return;
      }

      reportTimelineFrame(startFrame);
      void syncAllAudioAtFrame(startFrame);
      updateVideoMuteForFrame(startFrame, layout.clip, layout.trackId);

      runVideoPlayheadRafLoopRef.current();
    },
    [
      applyVideoSourceAndSeek,
      cancelPlaybackRafs,
      mediaStartSecForLayout,
      reportTimelineFrame,
      resetBasePingPongToPrimary,
      startStillPlaybackFromIndex,
      stopSequence,
      syncAllAudioAtFrame,
      updateVideoMuteForFrame,
      waitVideoCanShowFrame,
    ]
  );

  startPlaybackFromIndexRef.current = startPlaybackFromIndex;

  const startAudioOnlyFromFrame = useCallback(
    (startFrame: number) => {
      const tl = timelineRef.current;
      if (!tl) return;
      cancelPlaybackRafs();
      videoRef.current?.pause();
      playingLayoutIndexRef.current = null;
      isPlayingSequenceRef.current = true;

      const endFrame = timelineContentEndFrame(tl);
      const startedAt = performance.now();
      const startF = startFrame;

      reportTimelineFrame(startF);
      void syncAllAudioAtFrame(startF);
      updateVideoMuteForFrame(startF, null);

      const tick = () => {
        const elapsedSec = (performance.now() - startedAt) / 1000;
        const nextFrame = Math.min(
          endFrame - 1,
          startF + Math.round(elapsedSec * fps)
        );
        reportTimelineFrame(nextFrame);
        void syncAllAudioAtFrame(nextFrame);
        updateVideoMuteForFrame(nextFrame, null);
        if (nextFrame >= endFrame - 1) {
          audioOnlyRafRef.current = null;
          stopSequence();
          onPlaybackEnd?.();
          return;
        }
        audioOnlyRafRef.current = requestAnimationFrame(tick);
      };
      audioOnlyRafRef.current = requestAnimationFrame(tick);
    },
    [
      cancelPlaybackRafs,
      fps,
      onPlaybackEnd,
      reportTimelineFrame,
      stopSequence,
      syncAllAudioAtFrame,
      updateVideoMuteForFrame,
    ]
  );

  startAudioOnlyFromFrameRef.current = startAudioOnlyFromFrame;

  useEffect(() => {
    if (playing) return;
    lastUiFrameReportRef.current = null;
    stopSequence();
    seekToTimelineFrame(currentFrame);
  }, [currentFrame, playing, seekToTimelineFrame, stopSequence]);

  /** Start transport once when play turns on. Never restart on layout/timeline re-renders. */
  useEffect(() => {
    if (!playing) {
      playSessionRef.current += 1;
      stopSequence();
      return;
    }

    const session = playSessionRef.current;
    const layout = v1LayoutRef.current;
    const tl = timelineRef.current;
    if (!tl || layout.length === 0) return;

    const frame = currentFrameRef.current;
    const idx = layout.findIndex(
      (l) => frame >= l.startFrame && frame < l.endFrame
    );
    if (idx >= 0) {
      void startPlaybackFromIndexRef.current(idx, frame);
    } else {
      const idxNext = layout.findIndex((l) => l.startFrame >= frame);
      if (idxNext >= 0) {
        void startPlaybackFromIndexRef.current(
          idxNext,
          layout[idxNext]!.startFrame
        );
      } else {
        startAudioOnlyFromFrameRef.current(frame);
      }
    }

    return () => {
      if (playSessionRef.current !== session) return;
      stopSequence();
    };
  }, [playing, stopSequence]);

  useEffect(() => {
    if (isPlayingSequenceRef.current) return;

    const wasActive = lastDissolveActiveRef.current;
    lastDissolveActiveRef.current = dissolveActive;
    if (!wasActive || dissolveActive) return;

    const v = getActiveBaseVideo();
    if (!v || !timeline) return;
    const layout = primaryLayoutAtFrame(v1Layout, currentFrame);
    if (!layout || !isVideoClip(layout.clip)) return;

    if (!isPlayingSequenceRef.current) {
      applyVideoSourceAndSeek(
        v,
        layout,
        currentFrame,
        activeBasePingPongRef.current === 0
          ? lastPreviewVideoSrcRef
          : lastPreviewVideoSrcSecondaryRef,
        activeBasePingPongRef.current === 0
          ? lastSeekMediaTimeRef
          : lastSeekMediaTimeSecondaryRef
      );
      playbackOffsetSecRef.current = 0;
    } else {
      const targetTime = mediaTimeSecForTimelineFrame(
        layout.clip,
        currentFrame,
        fps
      );
      const expected = targetTime + playbackOffsetSecRef.current;
      if (Math.abs((v.currentTime ?? 0) - expected) > 0.04) {
        try {
          v.currentTime = Math.max(0, expected);
        } catch {
          /* ignore */
        }
      }
    }
  }, [
    applyVideoSourceAndSeek,
    currentFrame,
    dissolveActive,
    fps,
    getActiveBaseVideo,
    timeline,
    v1Layout,
  ]);

  useEffect(() => {
    const v = dissolveNextVideoRef.current;
    if (!v) return;
    void syncOverlayVideo(
      v,
      lastDissolveNextVideoSrcRef,
      nextOverlay
        ? { src: nextOverlay.src, timeSeconds: nextOverlay.timeSeconds }
        : null,
      setIsDissolveNextReady
    );
  }, [nextOverlay?.src, nextOverlay?.timeSeconds, syncOverlayVideo]);

  useEffect(() => {
    const v = dissolvePrevVideoRef.current;
    if (!v) return;
    void syncOverlayVideo(
      v,
      lastDissolvePrevVideoSrcRef,
      prevOverlay
        ? { src: prevOverlay.src, timeSeconds: prevOverlay.timeSeconds }
        : null,
      setIsDissolvePrevReady
    );
  }, [prevOverlay?.src, prevOverlay?.timeSeconds, syncOverlayVideo]);

  useEffect(() => {
    const a = dissolvePrevAudioRef.current;
    if (!a) return;
    const enabled =
      (dissolveActive || shouldCompositeNow || isDissolveCompositing) &&
      !!prevOverlay?.active;
    void syncDissolveAudio(
      a,
      lastDissolvePrevAudioSrcRef,
      prevOverlay
        ? {
            src: prevOverlay.audioSrc,
            timeSeconds: prevOverlay.audioTimeSeconds,
            volume: prevOverlay.opacity,
          }
        : null,
      enabled
    );
  }, [
    dissolveActive,
    isDissolveCompositing,
    prevOverlay,
    shouldCompositeNow,
    syncDissolveAudio,
  ]);

  useEffect(() => {
    const a = dissolveNextAudioRef.current;
    if (!a) return;
    const enabled =
      (dissolveActive || shouldCompositeNow || isDissolveCompositing) &&
      !!nextOverlay?.active;
    void syncDissolveAudio(
      a,
      lastDissolveNextAudioSrcRef,
      nextOverlay
        ? {
            src: nextOverlay.audioSrc,
            timeSeconds: nextOverlay.audioTimeSeconds,
            volume: nextOverlay.opacity,
          }
        : null,
      enabled
    );
  }, [
    dissolveActive,
    isDissolveCompositing,
    nextOverlay,
    shouldCompositeNow,
    syncDissolveAudio,
  ]);

  useEffect(() => {
    if (!timeline || playing) return;
    for (const layout of upperOverlays) {
      const key = layout.clip.id;
      const v = upperTrackVideoRefs.current[key];
      if (!v) continue;
      applyVideoSourceAndSeek(
        v,
        layout,
        currentFrame,
        { current: null },
        { current: null }
      );
    }
  }, [
    applyVideoSourceAndSeek,
    currentFrame,
    playing,
    timeline,
    upperOverlays,
  ]);

  /** Fallback if rAF is throttled; primary clock is requestAnimationFrame during play. */
  const handleTimeUpdate = useCallback(() => {
    if (!isPlayingSequenceRef.current) return;
    if (videoPlayheadRafRef.current != null) return;
    const video = getActiveBaseVideo();
    const index = playingLayoutIndexRef.current;
    if (!video || index === null) return;

    const layout = v1LayoutRef.current[index];
    if (!layout || !isVideoClip(layout.clip)) return;

    const trimInSec = layout.clip.trimInFrames / fps;
    const localSec =
      Math.max(0, video.currentTime - trimInSec) -
      playbackOffsetSecRef.current;
    const timelineFrame = Math.min(
      layout.endFrame - 1,
      Math.max(
        layout.startFrame,
        layout.startFrame + Math.floor(localSec * fps)
      )
    );

    reportTimelineFrame(timelineFrame);
    updateVideoMuteForFrame(timelineFrame, layout.clip, layout.trackId);

    const trimOutSec =
      (layout.clip.trimOutFrames ??
        layout.clip.trimInFrames + layout.clip.durationFrames) / fps;
    if (video.currentTime >= trimOutSec - 0.04) {
      advanceToNextLayout(index, timelineFrame);
    }
  }, [
    advanceToNextLayout,
    fps,
    getActiveBaseVideo,
    reportTimelineFrame,
    updateVideoMuteForFrame,
  ]);

  const displayLayout =
    playheadLayout ??
    (timeline ? layoutAtTimelineFrame(timeline, currentFrame) : null);

  return {
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
    shouldCompositeNow,
    isDissolveNextReady,
    isDissolvePrevReady,
    transitionOverlay,
    upperOverlays,
    displayLayout,
    playheadLayout,
  };
}
