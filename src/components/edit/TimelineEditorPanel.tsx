"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioTrack, Shot } from "@/lib/db/schema";
import type { TimelineClip, TimelineState } from "@/lib/timeline/types";
import { EditMediaLibrary } from "@/components/edit/EditMediaLibrary";
import { NleTransportBar } from "@/components/edit/NleTransportBar";
import { EditTimelineToolbar } from "@/components/edit/EditTimelineToolbar";
import { NleKeyboardShortcutsPanel } from "@/components/edit/NleKeyboardShortcutsPanel";
import {
  exportPresetStorageKey,
  formatPresetById,
  presetIdForFormat,
  TIMELINE_FORMAT_PRESETS,
  type ExportQualityPreset,
} from "@/lib/timeline/format-presets";
import { snapTimelineFrame } from "@/lib/timeline/snap-frame";
import type { TimelineTransitionType } from "@/lib/timeline/types";
import {
  TIMELINE_DRAG_MIME,
  parseTimelineDragPayload,
  type TimelineLibraryDragPayload,
} from "@/lib/timeline/drag-payload";
import { timelineContentEndFrame } from "@/lib/timeline/playhead";
import { isEmbeddedAudioClip } from "@/lib/timeline/embedded-audio-sync";
import { nanoid } from "@/lib/utils";

const DEFAULT_PX_PER_FRAME = 3;
const LABEL_COLUMN_PX = 72;
const LABEL_GAP_PX = 8;
/** Empty timeline tail so you can keep dropping clips to the right (NLE-style). */
const TAIL_PAD_SECONDS = 15;
const MIN_LANE_WIDTH_PX = 480;

type SelectedTimelineClip = {
  clipId: string;
  trackId: string;
  kind: "video" | "audio";
};

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

type Props = {
  projectId: string;
  sequenceId: string;
  shots: Shot[];
  audioTracks: AudioTrack[];
  fps: number;
  currentFrame: number;
  playing: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (frame: number) => void;
  onTimelineChange?: (timeline: TimelineState | null) => void;
  onTimelineLoadingChange?: (loading: boolean) => void;
  onPlaybackExtentChange?: (totalFrames: number) => void;
};

type DraggingClipState = {
  clipId: string;
  trackId: string;
  kind: "video" | "audio";
  pointerId: number;
  originClientX: number;
  originStartFrame: number;
};

export function TimelineEditorPanel({
  projectId,
  sequenceId,
  shots,
  audioTracks,
  fps,
  currentFrame,
  playing,
  onPlayPause,
  onStop,
  onSeek,
  onTimelineChange,
  onTimelineLoadingChange,
  onPlaybackExtentChange,
}: Props) {
  const [timeline, setTimeline] = useState<TimelineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedClip, setSelectedClip] = useState<SelectedTimelineClip | null>(
    null
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<DraggingClipState | null>(
    null
  );
  const [dropHighlightTrackId, setDropHighlightTrackId] = useState<string | null>(
    null
  );
  const [pxPerFrame, setPxPerFrame] = useState(DEFAULT_PX_PER_FRAME);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [exportPreset, setExportPreset] = useState<ExportQualityPreset>("source");
  const [formatPresetId, setFormatPresetId] = useState(
    TIMELINE_FORMAT_PRESETS[0]!.id
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(exportPresetStorageKey(projectId));
      if (
        stored === "source" ||
        stored === "720p" ||
        stored === "1080p" ||
        stored === "4k"
      ) {
        setExportPreset(stored);
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    if (!timeline?.format) return;
    setFormatPresetId(presetIdForFormat(timeline.format));
  }, [timeline?.format]);

  const scrollPlayheadIntoView = useCallback(
    (frame: number) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const playheadX =
        LABEL_COLUMN_PX + LABEL_GAP_PX + frame * pxPerFrame;
      const pad = Math.min(120, scroller.clientWidth * 0.2);
      const viewStart = scroller.scrollLeft;
      const viewEnd = viewStart + scroller.clientWidth;

      if (playheadX < viewStart + pad) {
        scroller.scrollLeft = Math.max(0, playheadX - pad);
      } else if (playheadX > viewEnd - pad) {
        scroller.scrollLeft = Math.min(
          scroller.scrollWidth - scroller.clientWidth,
          playheadX - scroller.clientWidth + pad
        );
      }
    },
    [pxPerFrame]
  );

  useEffect(() => {
    if (!playing) return;
    scrollPlayheadIntoView(currentFrame);
  }, [playing, currentFrame, scrollPlayheadIntoView]);

  const load = useCallback(async () => {
    setLoading(true);
    onTimelineLoadingChange?.(true);
    setTimeline(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sequences/${sequenceId}/timeline`
      );
      const data = await res.json();
      if (res.ok) setTimeline(data.timeline);
    } finally {
      setLoading(false);
      onTimelineLoadingChange?.(false);
    }
  }, [onTimelineLoadingChange, projectId, sequenceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveTimeline = useCallback(
    async (next: TimelineState) => {
      setSaving(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/sequences/${sequenceId}/timeline`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ timeline: next }),
          }
        );
        const data = await res.json();
        if (res.ok) setTimeline(data.timeline);
      } finally {
        setSaving(false);
      }
    },
    [projectId, sequenceId]
  );

  const tailPadFrames = fps * TAIL_PAD_SECONDS;

  const contentEndFrame = useMemo(
    () => (timeline ? timelineContentEndFrame(timeline) : 1),
    [timeline]
  );

  const totalFrames = useMemo(
    () => contentEndFrame + tailPadFrames,
    [contentEndFrame, tailPadFrames]
  );

  useEffect(() => {
    onTimelineChange?.(timeline);
  }, [onTimelineChange, timeline]);

  useEffect(() => {
    onPlaybackExtentChange?.(totalFrames);
  }, [onPlaybackExtentChange, totalFrames]);

  const laneWidthPx = useMemo(
    () =>
      Math.max(
        MIN_LANE_WIDTH_PX,
        totalFrames * pxPerFrame
      ),
    [totalFrames, pxPerFrame]
  );

  const scrollContentWidthPx =
    LABEL_COLUMN_PX + LABEL_GAP_PX + laneWidthPx;

  const insertLibraryPayload = useCallback(
    (
      payload: TimelineLibraryDragPayload,
      target: {
        trackKind: "video" | "audio";
        trackId: string;
        startFrame: number;
      }
    ) => {
      if (!timeline) return;
      if (payload.defaultTrackKind === "video" && target.trackKind !== "video") {
        return;
      }
      if (payload.defaultTrackKind === "audio" && target.trackKind !== "audio") {
        return;
      }

      const clip: TimelineClip = {
        id: nanoid(),
        name: payload.name,
        sourceType: payload.sourceType,
        sourceRef: payload.sourceRef,
        sourceUrl: payload.sourceUrl,
        startFrame: Math.max(0, target.startFrame),
        durationFrames: Math.max(1, payload.durationFrames),
        trimInFrames: 0,
        trimOutFrames: null,
        volume: 1,
      };

      if (target.trackKind === "video") {
        const videoTracks = timeline.videoTracks.map((track) =>
          track.id === target.trackId
            ? { ...track, clips: [...track.clips, clip] }
            : track
        );
        void saveTimeline({ ...timeline, videoTracks });
      } else {
        const audioTracksNext = timeline.audioTracks.map((track) =>
          track.id === target.trackId
            ? { ...track, clips: [...track.clips, clip] }
            : track
        );
        void saveTimeline({ ...timeline, audioTracks: audioTracksNext });
      }
    },
    [saveTimeline, timeline]
  );

  const insertAtPlayhead = useCallback(
    (payload: TimelineLibraryDragPayload) => {
      if (!timeline) return;
      if (payload.defaultTrackKind === "video") {
        const track = timeline.videoTracks[0];
        if (!track) return;
        insertLibraryPayload(payload, {
          trackKind: "video",
          trackId: track.id,
          startFrame: currentFrame,
        });
        return;
      }
      const slot = payload.audioSlot ?? 0;
      const track = timeline.audioTracks[slot] ?? timeline.audioTracks[0];
      if (!track) return;
      insertLibraryPayload(payload, {
        trackKind: "audio",
        trackId: track.id,
        startFrame: currentFrame,
      });
    },
    [currentFrame, insertLibraryPayload, timeline]
  );

  function frameFromClientXOnLane(clientX: number, laneEl: HTMLElement): number {
    const rect = laneEl.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.round(x / pxPerFrame));
  }

  function moveClipOnTimeline(
    state: TimelineState,
    drag: DraggingClipState,
    deltaFrames: number
  ): TimelineState {
    const raw = Math.max(0, drag.originStartFrame + deltaFrames);
    const nextStart = snapTimelineFrame(raw, state, { enabled: snapEnabled });
    if (drag.kind === "video") {
      return {
        ...state,
        videoTracks: state.videoTracks.map((track) =>
          track.id === drag.trackId
            ? {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.id === drag.clipId
                    ? { ...clip, startFrame: nextStart }
                    : clip
                ),
              }
            : track
        ),
      };
    }
    return {
      ...state,
      audioTracks: state.audioTracks.map((track) =>
        track.id === drag.trackId
          ? {
              ...track,
              clips: track.clips.map((clip) =>
                clip.id === drag.clipId
                  ? { ...clip, startFrame: nextStart }
                  : clip
              ),
            }
          : track
      ),
    };
  }

  useEffect(() => {
    if (!draggingClip) return;

    const drag = draggingClip;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      const deltaFrames = Math.round(
        (event.clientX - drag.originClientX) / pxPerFrame
      );
      setTimeline((prev) =>
        prev ? moveClipOnTimeline(prev, drag, deltaFrames) : prev
      );
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      const deltaFrames = Math.round(
        (event.clientX - drag.originClientX) / pxPerFrame
      );
      setTimeline((prev) => {
        if (!prev) return prev;
        const next = moveClipOnTimeline(prev, drag, deltaFrames);
        void saveTimeline(next);
        return next;
      });
      setDraggingClip(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingClip, pxPerFrame, saveTimeline, snapEnabled]);

  const zoomToFit = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || contentEndFrame <= 0) return;
    const usable = Math.max(
      120,
      scroller.clientWidth - LABEL_COLUMN_PX - LABEL_GAP_PX - 24
    );
    const nextPx = Math.max(
      1,
      Math.min(24, Math.floor(usable / contentEndFrame))
    );
    setPxPerFrame(nextPx);
    scroller.scrollLeft = 0;
  }, [contentEndFrame]);

  const requestPreviewFullscreen = useCallback(() => {
    const el = document.getElementById("nle-preview-root");
    if (!el) return;
    void el.requestFullscreen?.().catch(() => undefined);
  }, []);

  const applyFormatPreset = useCallback(
    (presetId: string) => {
      if (!timeline) return;
      setFormatPresetId(presetId);
      const preset = formatPresetById(presetId);
      void saveTimeline({
        ...timeline,
        format: {
          aspectRatio: preset.aspectRatio,
          width: preset.width,
          height: preset.height,
        },
      });
    },
    [saveTimeline, timeline]
  );

  function toggleAudioTrackMute(trackId: string) {
    if (!timeline) return;
    const audioTracks = timeline.audioTracks.map((track) =>
      track.id === trackId ? { ...track, muted: !track.muted } : track
    );
    const next = { ...timeline, audioTracks };
    setTimeline(next);
    void saveTimeline(next);
  }

  async function syncFromStoryboard() {
    const res = await fetch(
      `/api/projects/${projectId}/sequences/${sequenceId}/timeline/sync-from-storyboard`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "replace" }),
      }
    );
    const data = await res.json();
    if (res.ok) setTimeline(data.timeline);
  }

  function applyTransitionToSelected(
    type: TimelineTransitionType,
    durationSeconds = 0.5
  ) {
    if (!timeline || !selectedClip || selectedClip.kind !== "video") return;
    const track = timeline.videoTracks.find((t) => t.id === selectedClip.trackId);
    if (!track) return;
    const sorted = [...track.clips].sort(
      (a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id)
    );
    const idx = sorted.findIndex((c) => c.id === selectedClip.clipId);
    if (idx < 0) return;
    const prev = sorted[idx]!;
    const next = sorted[idx + 1];
    const dur = Math.max(0.1, durationSeconds);
    const nextClips = track.clips.map((c) => {
      if (c.id === prev.id) {
        return {
          ...c,
          transitionOut: { type, durationSeconds: dur },
        };
      }
      if (next && c.id === next.id && type === "dissolve") {
        return {
          ...c,
          transitionIn: { type, durationSeconds: dur },
        };
      }
      return c;
    });
    void saveTimeline({
      ...timeline,
      videoTracks: timeline.videoTracks.map((t) =>
        t.id === track.id ? { ...track, clips: nextClips } : t
      ),
    });
  }

  function splitAtPlayhead() {
    if (!timeline) return;
    const v1 = timeline.videoTracks[0];
    if (!v1) return;
    const nextClips: TimelineClip[] = [];
    let changed = false;
    for (const clip of v1.clips) {
      const end = clip.startFrame + clip.durationFrames;
      if (currentFrame > clip.startFrame && currentFrame < end) {
        const firstLen = currentFrame - clip.startFrame;
        const secondLen = end - currentFrame;
        nextClips.push({
          ...clip,
          id: `${clip.id}-a`,
          durationFrames: firstLen,
          trimOutFrames: clip.trimInFrames + firstLen,
        });
        nextClips.push({
          ...clip,
          id: `${clip.id}-b`,
          startFrame: currentFrame,
          durationFrames: secondLen,
          trimInFrames: clip.trimInFrames + firstLen,
        });
        changed = true;
      } else {
        nextClips.push(clip);
      }
    }
    if (!changed) return;
    const next: TimelineState = {
      ...timeline,
      videoTracks: [{ ...v1, clips: nextClips }],
    };
    void saveTimeline(next);
  }

  const deleteSelectedClip = useCallback(() => {
    if (!timeline || !selectedClip) return;

    if (selectedClip.kind === "video") {
      const videoTracks = timeline.videoTracks.map((track) =>
        track.id === selectedClip.trackId
          ? {
              ...track,
              clips: track.clips.filter((c) => c.id !== selectedClip.clipId),
            }
          : track
      );
      void saveTimeline({ ...timeline, videoTracks });
    } else {
      const audioTracks = timeline.audioTracks.map((track) =>
        track.id === selectedClip.trackId
          ? {
              ...track,
              clips: track.clips.filter((c) => c.id !== selectedClip.clipId),
            }
          : track
      );
      void saveTimeline({ ...timeline, audioTracks });
    }
    setSelectedClip(null);
  }, [selectedClip, timeline]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;

      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        setSnapEnabled((v) => !v);
        return;
      }
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        requestPreviewFullscreen();
        return;
      }
      if (event.key === "s" || event.key === "S") {
        if (mod) return;
        event.preventDefault();
        splitAtPlayhead();
        return;
      }
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        onPlayPause();
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        onStop();
        onSeek(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        onStop();
        onSeek(Math.max(0, totalFrames - 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onSeek(Math.max(0, currentFrame - 1));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onSeek(Math.min(totalFrames - 1, currentFrame + 1));
        return;
      }
      if (mod && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        setPxPerFrame((v) => Math.min(24, v + 1));
        return;
      }
      if (mod && event.key === "-") {
        event.preventDefault();
        setPxPerFrame((v) => Math.max(1, v - 1));
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (!selectedClip) return;
      event.preventDefault();
      deleteSelectedClip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentFrame,
    deleteSelectedClip,
    onPlayPause,
    onSeek,
    onStop,
    requestPreviewFullscreen,
    selectedClip,
    totalFrames,
  ]);

  if (loading || !timeline) {
    return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  }

  const tracks = [
    ...timeline.videoTracks.map((t) => ({ ...t, kind: "video" as const })),
    ...timeline.audioTracks.map((t) => ({ ...t, kind: "audio" as const })),
  ];

  const v1ClipCount = timeline.videoTracks[0]?.clips.length ?? 0;

  const hasV1Clips = v1ClipCount > 0;

  return (
    <div ref={panelRef} className="space-y-2" tabIndex={-1}>
      <NleTransportBar
        playing={playing}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        fps={fps}
        disabled={!hasV1Clips}
        onPlayPause={onPlayPause}
        onStop={onStop}
        onSeek={onSeek}
        onFrameStep={(delta) =>
          onSeek(
            Math.max(0, Math.min(totalFrames - 1, currentFrame + delta))
          )
        }
      />

      <EditTimelineToolbar
        projectId={projectId}
        sequenceId={sequenceId}
        snapEnabled={snapEnabled}
        onSnapEnabledChange={setSnapEnabled}
        formatPresetId={formatPresetId}
        onFormatPresetChange={applyFormatPreset}
        pxPerFrame={pxPerFrame}
        onPxPerFrameChange={setPxPerFrame}
        onZoomToFit={zoomToFit}
        onFullscreenPreview={requestPreviewFullscreen}
        exportPreset={exportPreset}
        onExportPresetChange={setExportPreset}
        canSplit={hasV1Clips}
        onSplit={splitAtPlayhead}
        canDelete={Boolean(selectedClip)}
        onDelete={deleteSelectedClip}
        onApplyTransition={applyTransitionToSelected}
        onSyncFromStoryboard={() => void syncFromStoryboard()}
        saving={saving}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />

      <p className="text-[11px] text-muted-foreground">
        V1 to V3 video, A1 to A3 audio.
        {v1ClipCount > 0
          ? ` ${v1ClipCount} clip${v1ClipCount === 1 ? "" : "s"} on V1.`
          : " Drop clips from the library below."}
      </p>

      <NleKeyboardShortcutsPanel
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <div
          ref={scrollerRef}
          className="w-full overflow-x-auto rounded-md border border-neutral-800 bg-neutral-950 p-2"
          style={{ minHeight: tracks.length * 44 + 24 }}
          onClick={(e) => {
            const scroller = e.currentTarget;
            const rect = scroller.getBoundingClientRect();
            const x =
              e.clientX -
              rect.left +
              scroller.scrollLeft -
              (LABEL_COLUMN_PX + LABEL_GAP_PX);
            const frame = Math.max(
              0,
              Math.min(totalFrames - 1, Math.round(x / pxPerFrame))
            );
            onSeek(frame);
          }}
        >
          <div
            className="relative"
            style={{ width: scrollContentWidthPx, minWidth: "100%" }}
          >
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-sky-400"
              style={{
                left:
                  LABEL_COLUMN_PX +
                  LABEL_GAP_PX +
                  currentFrame * pxPerFrame,
              }}
            />
            {tracks.map((track) => (
              <div
                key={track.id}
                className="mb-1 flex h-10 items-stretch"
                style={{ gap: LABEL_GAP_PX }}
              >
                <div
                  className="flex shrink-0 items-center justify-between gap-0.5 pt-1.5"
                  style={{ width: LABEL_COLUMN_PX }}
                >
                  <span className="truncate text-xs text-muted-foreground">
                    {track.name}
                  </span>
                  {track.kind === "audio" ? (
                    <button
                      type="button"
                      title={
                        track.muted
                          ? "Unmute this audio track"
                          : "Mute this audio track"
                      }
                      aria-pressed={track.muted ?? false}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggleAudioTrackMute(track.id);
                      }}
                      className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border text-[10px] font-semibold leading-none transition ${
                        track.muted
                          ? "border-amber-600/60 bg-amber-950/80 text-amber-200"
                          : "border-neutral-600 bg-neutral-900 text-muted-foreground hover:border-neutral-500 hover:text-neutral-200"
                      }`}
                    >
                      M
                    </button>
                  ) : null}
                </div>
                <div
                  className={`relative shrink-0 rounded bg-neutral-900/80 ${
                    dropHighlightTrackId === track.id
                      ? "ring-2 ring-sky-500/80"
                      : ""
                  }`}
                  style={{ width: laneWidthPx, height: 40 }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDropHighlightTrackId(track.id);
                  }}
                  onDragLeave={() => {
                    setDropHighlightTrackId((id) =>
                      id === track.id ? null : id
                    );
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropHighlightTrackId(null);
                    const raw = e.dataTransfer.getData(TIMELINE_DRAG_MIME);
                    const payload = parseTimelineDragPayload(raw);
                    if (!payload) return;
                    const laneEl = e.currentTarget;
                    const startFrame = frameFromClientXOnLane(
                      e.clientX,
                      laneEl
                    );
                    insertLibraryPayload(payload, {
                      trackKind: track.kind,
                      trackId: track.id,
                      startFrame,
                    });
                  }}
                >
                  {track.clips.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      className={`absolute top-1 h-8 touch-none overflow-hidden rounded px-1 text-left text-[10px] ${
                        track.kind === "video"
                          ? "bg-sky-900/80 text-sky-100"
                          : isEmbeddedAudioClip(clip)
                            ? "bg-amber-900/80 text-amber-100"
                            : "bg-emerald-900/70 text-emerald-100"
                      } ${selectedClip?.clipId === clip.id ? "ring-2 ring-sky-400" : ""} ${
                        draggingClip?.clipId === clip.id ? "opacity-80" : ""
                      }`}
                      style={{
                        left: clip.startFrame * pxPerFrame,
                        width: Math.max(24, clip.durationFrames * pxPerFrame),
                      }}
                      onPointerDown={(ev) => {
                        if (isEmbeddedAudioClip(clip)) {
                          ev.preventDefault();
                          return;
                        }
                        if (ev.button !== 0) return;
                        ev.stopPropagation();
                        setSelectedClip({
                          clipId: clip.id,
                          trackId: track.id,
                          kind: track.kind,
                        });
                        setDraggingClip({
                          clipId: clip.id,
                          trackId: track.id,
                          kind: track.kind,
                          pointerId: ev.pointerId,
                          originClientX: ev.clientX,
                          originStartFrame: clip.startFrame,
                        });
                        ev.currentTarget.setPointerCapture(ev.pointerId);
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        panelRef.current?.focus({ preventScroll: true });
                        onSeek(clip.startFrame);
                      }}
                      title={
                        isEmbeddedAudioClip(clip)
                          ? `${clip.name} (linked clip audio)`
                          : clip.name
                      }
                    >
                      {clip.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      <EditMediaLibrary
        projectId={projectId}
        shots={shots}
        audioTracks={audioTracks}
        fps={fps}
        onInsert={insertAtPlayhead}
      />
    </div>
  );
}
