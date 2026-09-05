"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioTrack, RenderJob, Shot } from "@/lib/db/schema";
import { FinishingTimeline } from "@/components/finishing/FinishingTimeline";
import {
  FinishingDeskTabs,
  type FinishingDeskTab,
} from "@/components/finishing/FinishingDeskTabs";
import { ShotSfxEditor } from "@/components/finishing/ShotSfxEditor";
import { AudioTrackEditor } from "@/components/finishing/AudioTrackEditor";
import {
  OverlayEditor,
  type TextOverlayDraft,
} from "@/components/export/OverlayEditor";
import type { TrimUpdateOptions } from "@/components/export/TrimEditor";
import { Badge, Card } from "@/components/ui/button";
import { InstallShotClip } from "@/components/storyboard/InstallShotClip";
import { clampTrim, trimPreviewFrameInShot } from "@/lib/finishing/trim";
import {
  mergeShotRenderOverrides,
  parseShotRenderOverrides,
  serializeShotRenderOverrides,
  type ShotAudioPolicy,
} from "@/lib/shot-render-overrides";
import { globalFrameFromVideoTime } from "@/lib/finishing/video-sync";
import { shotUsesRenderedVideo } from "@/lib/finishing/shot-preview-media";
import {
  frameAtTrimmedTimelinePosition,
  totalTimelineFrames,
  trimmedShotStartFrame,
} from "@/lib/timing/frames";

type PageProps = { params: Promise<{ projectId: string }> };

export default function FinishingPage({ params }: PageProps) {
  const { projectId } = use(params);
  const [shots, setShots] = useState<Shot[]>([]);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [overlays, setOverlays] = useState<TextOverlayDraft[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [fps, setFps] = useState(24);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [savingOverlays, setSavingOverlays] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllTrimShots, setShowAllTrimShots] = useState(false);
  const [activeDeskTab, setActiveDeskTab] =
    useState<FinishingDeskTab>("overlays");
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trimSaveTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  const totalFrames = useMemo(() => totalTimelineFrames(shots), [shots]);

  const renderedCount = useMemo(
    () => shots.filter((s) => Boolean(s.videoPath)).length,
    [shots]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, shotsRes, overlaysRes, audioRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/shots`),
        fetch(`/api/projects/${projectId}/overlays`),
        fetch(`/api/projects/${projectId}/audio`),
      ]);
      const projData = await projRes.json();
      const shotsData = await shotsRes.json();
      const overlaysData = await overlaysRes.json();
      const audioData = await audioRes.json();
      if (!projRes.ok) throw new Error(projData.error);
      if (!shotsRes.ok) throw new Error(shotsData.error);
      if (!overlaysRes.ok) throw new Error(overlaysData.error);
      if (!audioRes.ok) throw new Error(audioData.error);

      setFps(projData.project.defaultFps ?? 24);
      const loadedShots = (shotsData.shots ?? []) as Shot[];
      setShots(loadedShots);
      setOverlays(overlaysData.overlays ?? []);
      setAudioTracks(audioData.tracks ?? []);
      if (loadedShots.length > 0) {
        setSelectedShotId((prev) => prev ?? loadedShots[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/api/render-jobs/stream?projectId=${projectId}`);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            jobs?: RenderJob[];
            shots?: Shot[];
          };
          if (data.jobs) setJobs(data.jobs);
          if (data.shots) {
            setShots((prev) => {
              if (prev.length === 0) return data.shots ?? prev;
              const incoming = new Map(data.shots.map((shot) => [shot.id, shot]));
              const merged = prev
                .filter((shot) => incoming.has(shot.id))
                .map((shot) => {
                  const next = incoming.get(shot.id);
                  if (!next) return shot;
                  if (
                    next.videoPath === shot.videoPath &&
                    next.renderStatus === shot.renderStatus &&
                    next.updatedAt === shot.updatedAt &&
                    next.trimInFrames === shot.trimInFrames &&
                    next.trimOutFrames === shot.trimOutFrames &&
                    next.durationFrames === shot.durationFrames &&
                    next.title === shot.title &&
                    next.sortOrder === shot.sortOrder
                  ) {
                    return shot;
                  }
                  return {
                    ...shot,
                    title: next.title,
                    videoPath: next.videoPath,
                    renderStatus: next.renderStatus,
                    renderJobId: next.renderJobId,
                    updatedAt: next.updatedAt,
                    durationFrames: next.durationFrames,
                    trimInFrames: next.trimInFrames,
                    trimOutFrames: next.trimOutFrames,
                    sortOrder: next.sortOrder,
                    placeholderPath: next.placeholderPath,
                    placeholderKind: next.placeholderKind,
                  };
                });
              const known = new Set(merged.map((shot) => shot.id));
              const added = data.shots.filter((shot) => !known.has(shot.id));
              if (added.length === 0) return merged;
              return [...merged, ...added].sort(
                (a, b) => a.sortOrder - b.sortOrder
              );
            });
          }
        } catch {
          /* ignore malformed events */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [projectId]);

  useEffect(() => {
    return () => {
      for (const timer of trimSaveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      trimSaveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (totalFrames > 0 && currentFrame >= totalFrames) {
      setCurrentFrame(Math.max(0, totalFrames - 1));
    }
  }, [totalFrames, currentFrame]);

  useEffect(() => {
    if (!playing || shots.length === 0) return;
    const { shotIndex } = frameAtTrimmedTimelinePosition(shots, currentFrame);
    const shot = shots[shotIndex];
    if (shot && shot.id !== selectedShotId) {
      setSelectedShotId(shot.id);
    }
  }, [playing, currentFrame, shots, selectedShotId]);

  const playShotIndex = frameAtTrimmedTimelinePosition(
    shots,
    currentFrame
  ).shotIndex;

  useEffect(() => {
    if (!playing) {
      if (playRef.current) clearInterval(playRef.current);
      playRef.current = null;
      return;
    }

    const shot = shots[playShotIndex];
    const layerUsesVideo =
      shot &&
      (shotUsesRenderedVideo(shot) ||
        (shot.placeholderKind === "video" && Boolean(shot.placeholderPath)));

    if (layerUsesVideo) {
      if (playRef.current) clearInterval(playRef.current);
      playRef.current = null;
      return;
    }

    playRef.current = setInterval(() => {
      setCurrentFrame((f) => {
        if (f >= totalFrames - 1) {
          setPlaying(false);
          return 0;
        }
        return f + 1;
      });
    }, 1000 / fps);

    return () => {
      if (playRef.current) clearInterval(playRef.current);
      playRef.current = null;
    };
  }, [playing, fps, totalFrames, shots, playShotIndex]);

  async function handleReorder(orderedIds: string[]) {
    const res = await fetch(`/api/projects/${projectId}/shots/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Reorder failed");
      return;
    }
    setShots(data.shots ?? []);
  }

  const handleUpdateTrim = useCallback(
    (
      shotId: string,
      trimInFrames: number,
      trimOutFrames: number | null,
      options?: TrimUpdateOptions
    ) => {
      const shot = shots.find((entry) => entry.id === shotId);
      if (!shot) return;

      const clamped = clampTrim(
        shot.durationFrames,
        trimInFrames,
        trimOutFrames
      );

      setShots((prev) =>
        prev.map((entry) =>
          entry.id === shotId
            ? {
                ...entry,
                trimInFrames: clamped.trimInFrames,
                trimOutFrames: clamped.trimOutFrames,
              }
            : entry
        )
      );

      if (options?.previewEdge && options.previewEdge !== "none") {
        const shotIndex = shots.findIndex((entry) => entry.id === shotId);
        if (shotIndex >= 0) {
          const frameInShot = trimPreviewFrameInShot(
            shot.durationFrames,
            clamped.trimInFrames,
            clamped.trimOutFrames,
            options.previewEdge
          );
          // Start frames before this shot are unaffected by its own trim, but
          // use the updated trim values for the shot itself.
          const updatedShots = shots.map((entry) =>
            entry.id === shotId
              ? {
                  ...entry,
                  trimInFrames: clamped.trimInFrames,
                  trimOutFrames: clamped.trimOutFrames,
                }
              : entry
          );
          setPlaying(false);
          setCurrentFrame(
            trimmedShotStartFrame(updatedShots, shotIndex) + frameInShot
          );
          setSelectedShotId(shotId);
        }
      }

      const existing = trimSaveTimersRef.current.get(shotId);
      if (existing) clearTimeout(existing);

      trimSaveTimersRef.current.set(
        shotId,
        setTimeout(() => {
          void fetch(`/api/projects/${projectId}/shots/${shotId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trimInFrames: clamped.trimInFrames,
              trimOutFrames: clamped.trimOutFrames,
            }),
          }).catch(() => {
            setError("Failed to save trim");
          });
          trimSaveTimersRef.current.delete(shotId);
        }, 300)
      );
    },
    [projectId, shots]
  );

  const handleUpdateAudioPolicy = useCallback(
    (shotId: string, policy: ShotAudioPolicy | "") => {
      const shot = shots.find((entry) => entry.id === shotId);
      if (!shot) return;

      // Empty string means Auto: clear the explicit override.
      const next = serializeShotRenderOverrides(
        mergeShotRenderOverrides(
          parseShotRenderOverrides(shot.renderOverridesJson),
          { audioPolicy: (policy || "") as ShotAudioPolicy }
        )
      );

      setShots((prev) =>
        prev.map((entry) =>
          entry.id === shotId ? { ...entry, renderOverridesJson: next } : entry
        )
      );

      void fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renderOverridesJson: next }),
      }).catch(() => {
        setError("Failed to save shot audio setting");
      });
    },
    [projectId, shots]
  );

  async function handleSaveOverlays() {
    setSavingOverlays(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/overlays`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overlays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setOverlays(data.overlays ?? overlays);
    } finally {
      setSavingOverlays(false);
    }
  }

  function handleVideoTimeUpdate(shotIndex: number, videoTimeSec: number) {
    if (!playing) return;
    setCurrentFrame(globalFrameFromVideoTime(shots, shotIndex, videoTimeSec, fps));
  }

  function handleVideoShotEnd(shotIndex: number) {
    if (!playing) return;
    const nextIndex = shotIndex + 1;
    if (nextIndex >= shots.length) {
      setPlaying(false);
      setCurrentFrame(0);
      return;
    }
    setCurrentFrame(trimmedShotStartFrame(shots, nextIndex));
  }

  function handleSelectShotFromTrim(shotId: string) {
    setSelectedShotId(shotId);
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading finishing page…</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Finishing</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Preview rendered clips, trim on the timeline, then add text and audio
            before export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {renderedCount} / {shots.length} rendered
          </Badge>
          <Link
            href={`/projects/${projectId}/export`}
            className="text-sm text-primary hover:underline"
          >
            Go to Export
          </Link>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <section className="space-y-4">
        <FinishingTimeline
          projectId={projectId}
          shots={shots}
          fps={fps}
          selectedShotId={selectedShotId}
          currentFrame={currentFrame}
          playing={playing}
          overlays={overlays}
          audioTracks={audioTracks}
          showAllTrimShots={showAllTrimShots}
          onToggleShowAllTrim={() => setShowAllTrimShots((value) => !value)}
          onUpdateTrim={handleUpdateTrim}
          onUpdateAudioPolicy={handleUpdateAudioPolicy}
          onSelectShotFromTrim={handleSelectShotFromTrim}
          onSelectShot={setSelectedShotId}
          onReorder={(ids) => void handleReorder(ids)}
          onPlayPause={() => {
            if (!playing && totalFrames === 0) return;
            setPlaying((p) => !p);
          }}
          onStop={() => {
            setPlaying(false);
            setCurrentFrame(0);
          }}
          onSeek={(frame) => {
            const clamped = Math.max(
              0,
              Math.min(frame, Math.max(totalFrames - 1, 0))
            );
            setCurrentFrame(clamped);
            const { shotIndex } = frameAtTrimmedTimelinePosition(
              shots,
              clamped
            );
            const shot = shots[shotIndex];
            if (shot) setSelectedShotId(shot.id);
          }}
          onVideoTimeUpdate={handleVideoTimeUpdate}
          onVideoShotEnd={handleVideoShotEnd}
        />
      </section>

      {selectedShotId ? (
        <Card className="mb-0 space-y-0 p-4">
          <InstallShotClip
            projectId={projectId}
            shotId={selectedShotId}
            onInstalled={(shot) => {
              setShots((prev) =>
                prev.map((item) => (item.id === shot.id ? { ...item, ...shot } : item))
              );
            }}
          />
        </Card>
      ) : null}

      <section className="space-y-3">
        <FinishingDeskTabs
          activeTab={activeDeskTab}
          onChange={setActiveDeskTab}
        />
        <Card className="mb-0 space-y-4 p-4">
          {activeDeskTab === "overlays" ? (
            <OverlayEditor
              overlays={overlays}
              totalFrames={totalFrames}
              onChange={setOverlays}
              onSave={handleSaveOverlays}
              saving={savingOverlays}
            />
          ) : activeDeskTab === "score" ? (
            <AudioTrackEditor
              projectId={projectId}
              tracks={audioTracks}
              shots={shots}
              jobs={jobs}
              totalFrames={totalFrames}
              fps={fps}
              currentFrame={currentFrame}
              onChange={setAudioTracks}
              variant="score"
            />
          ) : activeDeskTab === "sfx" ? (
            <ShotSfxEditor
              projectId={projectId}
              tracks={audioTracks}
              shots={shots}
              totalFrames={totalFrames}
              fps={fps}
              onChange={setAudioTracks}
            />
          ) : (
            <AudioTrackEditor
              projectId={projectId}
              tracks={audioTracks}
              shots={shots}
              jobs={jobs}
              totalFrames={totalFrames}
              fps={fps}
              currentFrame={currentFrame}
              onChange={setAudioTracks}
              variant="dialog"
            />
          )}
        </Card>
      </section>
    </div>
  );
}
