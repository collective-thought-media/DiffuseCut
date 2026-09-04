"use client";

import { useMemo, useRef, useState } from "react";
import type { AudioTrack, Shot } from "@/lib/db/schema";
import {
  applySpanModeToTrack,
  AUDIO_SPAN_MODES,
  formatTrackSpanSummary,
  framesToSeconds,
  parseSpanMode,
  resolveTrackTiming,
  secondsToFrames,
  type AudioTrackSpanMode,
} from "@/lib/finishing/audio-track-timing";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/button";
import { mediaUrl } from "@/lib/media-url";
import Link from "next/link";

interface AudioTrackEditorProps {
  projectId: string;
  tracks: AudioTrack[];
  shots: Shot[];
  totalFrames: number;
  fps: number;
  currentFrame?: number;
  onChange: (tracks: AudioTrack[]) => void;
  variant?: "score" | "dialog";
}

const KINDS = ["music", "voiceover", "sfx"] as const;

type TrackKind = (typeof KINDS)[number];

const VARIANT_CONFIG = {
  score: {
    kind: "music" as TrackKind,
    title: "Musical Score",
    description:
      "Sync music to your edit length. Describe a score, set how long it runs, then generate or upload.",
    emptyMessage:
      "No score yet. Use a preset above to add music sized to your film, or a shorter segment you can chain with another track.",
    promptLabel: "Score / sound brief",
    promptPlaceholder:
      "Genre, mood, instruments, and arc. Example: dark orchestral slow burn, hellish drones to heavenly strings, 72 bpm, wide dynamics...",
    presetFullLabel: (totalSeconds: string) => `Full score (${totalSeconds}s)`,
    presetPlayheadLabel: "10s segment at playhead",
    presetRestLabel: "Score from playhead to end",
    presetCustomLabel: "Custom track",
    generateError: "Describe the score or sound in the brief field first.",
  },
  dialog: {
    kind: "voiceover" as TrackKind,
    title: "Dialog",
    description:
      "Sync dialogue and voiceover to your edit. Set span, describe the read, then generate or upload.",
    emptyMessage:
      "No dialog yet. Use a preset above to add voiceover sized to your film, or a shorter segment at the playhead.",
    promptLabel: "Dialog / voice brief",
    promptPlaceholder:
      "Gravelly narrator, low and calm. No music. Match the tension of the ascent scene...",
    presetFullLabel: (totalSeconds: string) => `Full film dialog (${totalSeconds}s)`,
    presetPlayheadLabel: "10s segment at playhead",
    presetRestLabel: "Dialog from playhead to end",
    presetCustomLabel: "Custom track",
    generateError: "Describe the dialog or voice in the brief field first.",
  },
} as const;

function defaultLabel(
  kind: TrackKind,
  spanMode: AudioTrackSpanMode,
  variant: "score" | "dialog"
) {
  if (kind === "music" && spanMode === "full_timeline") return "Full score";
  if (kind === "music" && spanMode === "custom") return "Score segment";
  if (kind === "voiceover" && spanMode === "full_timeline") return "Full dialog";
  if (kind === "voiceover" && spanMode === "custom") return "Dialog segment";
  if (kind === "sfx") return "Sound effect";
  return variant === "dialog" ? "New dialog track" : "New score track";
}

export function AudioTrackEditor({
  projectId,
  tracks,
  shots,
  totalFrames,
  fps,
  currentFrame = 0,
  onChange,
  variant = "score",
}: AudioTrackEditorProps) {
  const config = VARIANT_CONFIG[variant];
  const visibleTracks = tracks.filter((track) => track.kind === config.kind);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const totalSeconds = (totalFrames / fps).toFixed(2);

  const timelineSummary = useMemo(() => {
    if (shots.length === 0) return "No storyboard shots yet.";
    return `${shots.length} shots, ${totalFrames} frames (${totalSeconds}s @ ${fps} fps)`;
  }, [shots.length, totalFrames, totalSeconds, fps]);

  async function patchTrack(
    trackId: string,
    patch: Record<string, unknown>
  ): Promise<AudioTrack | null> {
    const res = await fetch(
      `/api/projects/${projectId}/audio/${trackId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Update failed");
    return data.track as AudioTrack;
  }

  async function createTrack(options: {
    kind: TrackKind;
    spanMode: AudioTrackSpanMode;
    durationSeconds?: number;
    startFrame?: number;
    targetShotId?: string | null;
    label?: string;
  }) {
    setError(null);
    setBusyId("new");
    try {
      const draft = applySpanModeToTrack(
        {
          startFrame: options.startFrame ?? currentFrame,
          durationFrames:
            options.durationSeconds != null
              ? secondsToFrames(options.durationSeconds, fps)
              : null,
          spanMode: options.spanMode,
          targetShotId: options.targetShotId ?? null,
        },
        shots,
        totalFrames,
        {
          spanMode: options.spanMode,
          startFrame: options.startFrame,
          durationFrames:
            options.durationSeconds != null
              ? secondsToFrames(options.durationSeconds, fps)
              : undefined,
          targetShotId: options.targetShotId,
        }
      );

      const res = await fetch(`/api/projects/${projectId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: options.kind,
          label:
            options.label ??
            defaultLabel(options.kind, options.spanMode, variant),
          filePath: "audio/tracks/pending",
          startFrame: draft.startFrame,
          durationFrames: draft.durationFrames,
          spanMode: draft.spanMode,
          targetShotId: draft.targetShotId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      onChange([...tracks, data.track]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusyId(null);
    }
  }

  async function applyTrackPatch(
    trackId: string,
    patch: Record<string, unknown>,
    localMerge?: Partial<AudioTrack>
  ) {
    setError(null);
    try {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;

      let payload = { ...patch };
      if (
        patch.spanMode !== undefined ||
        patch.startFrame !== undefined ||
        patch.durationFrames !== undefined ||
        patch.targetShotId !== undefined
      ) {
        const resolved = applySpanModeToTrack(track, shots, totalFrames, {
          spanMode: patch.spanMode as AudioTrackSpanMode | undefined,
          startFrame: patch.startFrame as number | undefined,
          durationFrames: patch.durationFrames as number | null | undefined,
          targetShotId: patch.targetShotId as string | null | undefined,
        });
        payload = {
          ...payload,
          spanMode: resolved.spanMode,
          startFrame: resolved.startFrame,
          durationFrames: resolved.durationFrames,
          targetShotId: resolved.targetShotId,
        };
      }

      const updated = await patchTrack(trackId, payload);
      if (!updated) return;
      onChange(
        tracks.map((t) =>
          t.id === trackId ? { ...updated, ...localMerge } : t
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleGenerate(trackId: string) {
    setError(null);
    setBusyId(trackId);
    try {
      const track = tracks.find((t) => t.id === trackId);
      if (!track?.promptText?.trim()) {
        throw new Error(config.generateError);
      }

      const res = await fetch(
        `/api/projects/${projectId}/audio/${trackId}/generate`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      onChange(tracks.map((t) => (t.id === trackId ? data.track : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(trackId: string) {
    setError(null);
    setBusyId(trackId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/audio/${trackId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      onChange(tracks.filter((t) => t.id !== trackId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpload(trackId: string, file: File) {
    setError(null);
    setBusyId(trackId);
    try {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("entityType", "audio");
      formData.set("entityId", trackId);
      formData.set("file", file);

      const res = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      onChange(tracks.map((t) => (t.id === trackId ? data.entity : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{config.title}</h3>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </div>

      <Card className="mb-0 space-y-3 p-4">
        <p className="text-sm font-medium">Project timeline</p>
        <p className="text-xs text-muted-foreground">{timelineSummary}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busyId === "new" || totalFrames === 0}
            onClick={() =>
              void createTrack({
                kind: config.kind,
                spanMode: "full_timeline",
              })
            }
          >
            {config.presetFullLabel(totalSeconds)}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busyId === "new" || totalFrames === 0}
            onClick={() =>
              void createTrack({
                kind: config.kind,
                spanMode: "custom",
                durationSeconds: 10,
                startFrame: currentFrame,
              })
            }
          >
            {config.presetPlayheadLabel}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busyId === "new" || totalFrames === 0}
            onClick={() =>
              void createTrack({
                kind: config.kind,
                spanMode: "rest_of_timeline",
                startFrame: currentFrame,
              })
            }
          >
            {config.presetRestLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === "new"}
            onClick={() =>
              void createTrack({ kind: config.kind, spanMode: "custom" })
            }
          >
            {config.presetCustomLabel}
          </Button>
        </div>
      </Card>

      {visibleTracks.length === 0 ? (
        <Card className="mb-0 p-4 text-center text-sm text-muted-foreground">
          {config.emptyMessage}
        </Card>
      ) : (
        visibleTracks.map((track) => {
          const hasFile =
            track.filePath && !track.filePath.includes("pending");
          const spanMode = parseSpanMode(track.spanMode);
          const timing = resolveTrackTiming(track, shots, totalFrames);
          const spanSummary = formatTrackSpanSummary(
            track,
            shots,
            totalFrames,
            fps
          );
          const customDurationSec = framesToSeconds(
            track.durationFrames ?? timing.durationFrames,
            fps
          );

          return (
            <Card key={track.id} className="mb-0 space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{track.label}</p>
                  <p className="text-xs text-muted-foreground">{spanSummary}</p>
                </div>
                {hasFile && (
                  <audio
                    controls
                    preload="metadata"
                    className="h-8 max-w-full"
                    src={mediaUrl(projectId, track.filePath, {
                      version: track.updatedAt,
                    })}
                  />
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`audio-prompt-${track.id}`}>
                    {config.promptLabel}
                  </Label>
                  <Textarea
                    id={`audio-prompt-${track.id}`}
                    value={track.promptText ?? ""}
                    placeholder={config.promptPlaceholder}
                    className="min-h-[72px] text-sm"
                    onChange={(e) =>
                      onChange(
                        tracks.map((t) =>
                          t.id === track.id
                            ? { ...t, promptText: e.target.value }
                            : t
                        )
                      )
                    }
                    onBlur={() =>
                      void applyTrackPatch(track.id, {
                        promptText: track.promptText,
                      })
                    }
                  />
                  {variant === "score" && (
                    <p className="text-[11px] text-muted-foreground">
                      Your brief is sent to ACE-Step as style tags. Add section
                      markers like [intro] or [build-up] only if you want
                      structural control.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`audio-label-${track.id}`}>Label</Label>
                  <Input
                    id={`audio-label-${track.id}`}
                    value={track.label}
                    onChange={(e) =>
                      onChange(
                        tracks.map((t) =>
                          t.id === track.id
                            ? { ...t, label: e.target.value }
                            : t
                        )
                      )
                    }
                    onBlur={() =>
                      void applyTrackPatch(track.id, { label: track.label })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`audio-kind-${track.id}`}>Kind</Label>
                  <Input
                    id={`audio-kind-${track.id}`}
                    value={config.kind}
                    readOnly
                    className="capitalize"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`audio-span-${track.id}`}>
                    Timeline span
                  </Label>
                  <Select
                    id={`audio-span-${track.id}`}
                    value={spanMode}
                    onChange={(e) =>
                      void applyTrackPatch(track.id, {
                        spanMode: e.target.value,
                      })
                    }
                  >
                    {AUDIO_SPAN_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {
                      AUDIO_SPAN_MODES.find((m) => m.value === spanMode)
                        ?.description
                    }
                  </p>
                </div>

                {spanMode === "single_shot" && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`audio-shot-${track.id}`}>Shot</Label>
                    <Select
                      id={`audio-shot-${track.id}`}
                      value={track.targetShotId ?? ""}
                      onChange={(e) =>
                        void applyTrackPatch(track.id, {
                          targetShotId: e.target.value || null,
                        })
                      }
                    >
                      {shots.map((shot, index) => (
                        <option key={shot.id} value={shot.id}>
                          {shot.title?.trim() || `Shot ${index + 1}`} (
                          {(shot.durationFrames / fps).toFixed(2)}s)
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {(spanMode === "custom" || spanMode === "rest_of_timeline") && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor={`audio-start-${track.id}`}>
                        Start frame
                      </Label>
                      <Input
                        id={`audio-start-${track.id}`}
                        type="number"
                        min={0}
                        max={Math.max(0, totalFrames - 1)}
                        value={track.startFrame}
                        onChange={(e) =>
                          onChange(
                            tracks.map((t) =>
                              t.id === track.id
                                ? { ...t, startFrame: Number(e.target.value) }
                                : t
                            )
                          )
                        }
                        onBlur={() =>
                          void applyTrackPatch(track.id, {
                            startFrame: track.startFrame,
                          })
                        }
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {(track.startFrame / fps).toFixed(2)}s on timeline
                      </p>
                    </div>

                    {spanMode === "custom" && (
                      <div className="space-y-1.5">
                        <Label htmlFor={`audio-duration-${track.id}`}>
                          Duration (seconds)
                        </Label>
                        <Input
                          id={`audio-duration-${track.id}`}
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={customDurationSec}
                          onChange={(e) => {
                            const seconds = Number(e.target.value);
                            onChange(
                              tracks.map((t) =>
                                t.id === track.id
                                  ? {
                                      ...t,
                                      durationFrames: secondsToFrames(
                                        seconds,
                                        fps
                                      ),
                                    }
                                  : t
                              )
                            );
                          }}
                          onBlur={() =>
                            void applyTrackPatch(track.id, {
                              durationFrames: track.durationFrames,
                            })
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Ends at frame{" "}
                          {track.startFrame +
                            (track.durationFrames ?? timing.durationFrames)}
                        </p>
                      </div>
                    )}
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor={`audio-volume-${track.id}`}>
                    Volume (0 to 1)
                  </Label>
                  <Input
                    id={`audio-volume-${track.id}`}
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={track.volume}
                    onChange={(e) =>
                      onChange(
                        tracks.map((t) =>
                          t.id === track.id
                            ? { ...t, volume: Number(e.target.value) }
                            : t
                        )
                      )
                    }
                    onBlur={() =>
                      void applyTrackPatch(track.id, { volume: track.volume })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    1 is full volume, 0.5 is half, 0 is silent (
                    {Math.round(Math.min(1, Math.max(0, track.volume)) * 100)}%
                    now).
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={busyId === track.id}
                  onClick={() => void handleGenerate(track.id)}
                >
                  {busyId === track.id
                    ? "Generating…"
                    : hasFile
                      ? "Regenerate to span"
                      : "Generate to span"}
                </Button>
                <input
                  ref={(node) => {
                    fileInputRefs.current[track.id] = node;
                  }}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUpload(track.id, file);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === track.id}
                  onClick={() => fileInputRefs.current[track.id]?.click()}
                >
                  {hasFile ? "Replace upload" : "Upload score file"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId === track.id}
                  onClick={() => void handleDelete(track.id)}
                >
                  Remove
                </Button>
              </div>
            </Card>
          );
        })
      )}

      <p className="text-xs text-muted-foreground">
        Upload your own score file, generate with local or remote ACE-Step in{" "}
        <Link href="/settings" className="text-primary hover:underline">
          Settings
        </Link>
        . Long spans are loop-fitted to your exact frame duration.
      </p>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
