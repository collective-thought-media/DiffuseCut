"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioTrack, RenderJob, Shot } from "@/lib/db/schema";
import { isLipSyncJob } from "@/lib/render-shot-display";
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
  shotTimelineFrames,
  trimmedShotStartFrame,
} from "@/lib/timing/frames";
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
  jobs?: RenderJob[];
}

const KINDS = ["music", "voiceover", "sfx"] as const;

type TrackKind = (typeof KINDS)[number];

const VARIANT_CONFIG = {
  score: {
    kind: "music" as TrackKind,
    title: "Musical Score",
    description:
      "Sync music to your edit. Generate with ACE-Step, or add a track from an MP3, WAV, or other audio file you already have.",
    emptyMessage:
      "No score yet. Add a track from a file, or use a preset below to create an empty track and generate.",
    promptLabel: "Score / sound brief",
    promptPlaceholder:
      "Genre, mood, instruments, and arc. Example: dark orchestral slow burn, hellish drones to heavenly strings, 72 bpm, wide dynamics...",
    presetFullLabel: (totalSeconds: string) => `Full score (${totalSeconds}s)`,
    presetPlayheadLabel: "10s segment at playhead",
    presetRestLabel: "Score from playhead to end",
    presetCustomLabel: "Custom empty track",
    addFromFileLabel: "Add score from file",
    generateError: "Describe the score or sound in the brief field first.",
    uploadLabel: "Upload score file",
    footerNote:
      "Add or replace a score file (MP3, WAV, M4A, FLAC, OGG, AAC), or generate with local or remote ACE-Step in",
  },
  dialog: {
    kind: "voiceover" as TrackKind,
    title: "Dialog",
    description:
      "Sync dialogue and voiceover to your edit. Set span, describe the read, then generate or upload a recording.",
    emptyMessage:
      "No dialog yet. Add a track from a file, or use a preset below to create an empty track and generate.",
    promptLabel: "Dialog script",
    promptPlaceholder:
      "Paste the exact lines to speak. Example: Welcome to the city. We have one night to finish this.",
    presetFullLabel: (totalSeconds: string) => `Full film dialog (${totalSeconds}s)`,
    presetPlayheadLabel: "10s segment at playhead",
    presetRestLabel: "Dialog from playhead to end",
    presetCustomLabel: "Custom empty track",
    addFromFileLabel: "Add dialog from file",
    generateError: "Add the dialog lines to speak in the script field first.",
    uploadLabel: "Upload voice over file",
    footerNote:
      "Add or replace a recording (MP3, WAV, M4A, FLAC, OGG, AAC), or Generate to span for spoken dialog (Edge TTS on this machine, or ElevenLabs when configured) in",
  },
} as const;

const AUDIO_FILE_ACCEPT =
  "audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus";

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
  jobs = [],
}: AudioTrackEditorProps) {
  const config = VARIANT_CONFIG[variant];
  const visibleTracks = tracks.filter((track) => track.kind === config.kind);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [lipSyncBusy, setLipSyncBusy] = useState(false);
  const [lipSyncMessage, setLipSyncMessage] = useState<string | null>(null);
  const [lipSyncTarget, setLipSyncTarget] = useState<string>("");
  const [watchedLipSyncJobIds, setWatchedLipSyncJobIds] = useState<string[]>(
    []
  );
  const [dialogSpeechHint, setDialogSpeechHint] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addFromFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (variant !== "dialog") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/system/dialog-speech");
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const ds = data.dialogSpeech as {
          primary?: string;
          edgeTtsVoice?: string;
        };
        if (ds.primary === "elevenlabs_tts") {
          setDialogSpeechHint(
            "Dialog Generate uses ElevenLabs text-to-speech."
          );
        } else if (ds.primary === "edge_tts") {
          setDialogSpeechHint(
            `Dialog Generate uses local Edge TTS (voice: ${ds.edgeTtsVoice ?? "en-US-ChristopherNeural"}).`
          );
        } else {
          setDialogSpeechHint(
            "Dialog Generate needs pip install edge-tts or an ElevenLabs key in Settings."
          );
        }
      } catch {
        if (!cancelled) setDialogSpeechHint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const watchedLipSyncJobs = useMemo(() => {
    const wanted = new Set(watchedLipSyncJobIds);
    return jobs
      .filter((job) => wanted.has(job.id) && isLipSyncJob(job))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [jobs, watchedLipSyncJobIds]);

  const lipSyncProgressJob =
    watchedLipSyncJobs.find(
      (job) => job.status === "running" || job.status === "queued"
    ) ?? watchedLipSyncJobs[0] ?? null;

  const dialogCoveredShots = useMemo(() => {
    if (variant !== "dialog") return [];
    const readyTracks = tracks.filter(
      (track) =>
        track.kind === "voiceover" &&
        track.filePath &&
        !track.filePath.includes("pending")
    );
    if (readyTracks.length === 0) return [];
    return shots.filter((shot, index) => {
      const shotStart = trimmedShotStartFrame(shots, index);
      const span = shotTimelineFrames(shot);
      return readyTracks.some((track) => {
        const timing = resolveTrackTiming(track, shots, totalFrames);
        return (
          Math.min(shotStart + span, timing.endFrame) -
            Math.max(shotStart, timing.startFrame) >=
          1
        );
      });
    });
  }, [variant, tracks, shots, totalFrames]);

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

  async function createTrackRecord(options: {
    kind: TrackKind;
    spanMode: AudioTrackSpanMode;
    durationSeconds?: number;
    startFrame?: number;
    targetShotId?: string | null;
    label?: string;
  }): Promise<AudioTrack | null> {
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
    const created = data.track as AudioTrack;
    onChange([...tracks, created]);
    return created;
  }

  async function createTrack(options: {
    kind: TrackKind;
    spanMode: AudioTrackSpanMode;
    durationSeconds?: number;
    startFrame?: number;
    targetShotId?: string | null;
    label?: string;
  }): Promise<AudioTrack | null> {
    setError(null);
    setBusyId("new");
    try {
      return await createTrackRecord(options);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function uploadFileToTrack(
    trackId: string,
    file: File,
    tracksSnapshot: AudioTrack[]
  ): Promise<AudioTrack> {
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
    const updated = data.entity as AudioTrack;
    onChange(tracksSnapshot.map((t) => (t.id === trackId ? updated : t)));
    return updated;
  }

  async function handleAddFromFile(file: File) {
    setError(null);
    setBusyId("new");
    try {
      const created = await createTrackRecord({
        kind: config.kind,
        spanMode: "full_timeline",
        label:
          file.name.replace(/\.[^.]+$/, "").slice(0, 80) ||
          defaultLabel(config.kind, "full_timeline", variant),
      });
      if (!created) return;
      setBusyId(created.id);
      await uploadFileToTrack(created.id, file, [...tracks, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
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
    setGenerateStatus(
      "Generating… If a video render is using ComfyUI, this waits in line."
    );
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
      const waitedMs = data.generation?.gpuWaitedMs as number | undefined;
      const waitedFor = data.generation?.gpuWaitedFor as
        | string
        | null
        | undefined;
      if (waitedMs && waitedMs >= 3000 && waitedFor) {
        setGenerateStatus(
          `Waited for ${waitedFor}, then generated.`
        );
      } else {
        setGenerateStatus(null);
      }
    } catch (err) {
      setGenerateStatus(null);
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

  async function handleLipSyncRenders() {
    setError(null);
    setLipSyncMessage(null);
    setLipSyncBusy(true);
    try {
      const target = lipSyncTarget || dialogCoveredShots[0]?.id || "";
      const res = await fetch(`/api/projects/${projectId}/lip-sync-renders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          target === "__all__" ? {} : { shotIds: [target] }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lip sync render failed");
      const queuedJobs = (data.jobs ?? []) as RenderJob[];
      setWatchedLipSyncJobIds(queuedJobs.map((job) => job.id));
      const count = queuedJobs.length;
      const firstTitle =
        shots.find((shot) => shot.id === queuedJobs[0]?.shotId)?.title?.trim() ||
        "the selected shot";
      setLipSyncMessage(
        count === 1
          ? `Lip sync queued for ${firstTitle}. Stay on this page. Progress shows below, and the timeline swaps the clip when it finishes.`
          : `Queued ${count} lip sync clips. Stay on this page. Progress shows below, and the timeline swaps each clip when it finishes.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lip sync render failed");
    } finally {
      setLipSyncBusy(false);
    }
  }

  async function handleUpload(trackId: string, file: File) {
    setError(null);
    setBusyId(trackId);
    try {
      await uploadFileToTrack(trackId, file, tracks);
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
          <input
            ref={addFromFileInputRef}
            type="file"
            accept={AUDIO_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAddFromFile(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            disabled={busyId === "new" || totalFrames === 0}
            onClick={() => addFromFileInputRef.current?.click()}
          >
            {busyId === "new"
              ? "Adding file…"
              : config.addFromFileLabel}
          </Button>
          <Button
            size="sm"
            variant="secondary"
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
        <p className="text-[11px] text-muted-foreground">
          {variant === "score"
            ? "Add score from file imports MP3, WAV, M4A, FLAC, OGG, or AAC and places it on the full timeline. Use Replace upload on a track to swap the file later."
            : "Add dialog from file imports a recording onto the full timeline. Use Replace upload on a track to swap the file later."}
        </p>
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
                      Used when you Generate to span. Uploaded files ignore this
                      brief. Cinematic prompts are wrapped in the Control Gate
                      ACE-Step tag pack automatically.
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
                    ? "Waiting / generating…"
                    : hasFile
                      ? "Regenerate to span"
                      : "Generate to span"}
                </Button>
                <input
                  ref={(node) => {
                    fileInputRefs.current[track.id] = node;
                  }}
                  type="file"
                  accept={AUDIO_FILE_ACCEPT}
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
                  {hasFile ? "Replace upload" : config.uploadLabel}
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

      {variant === "dialog" && (
        <Card className="mb-0 space-y-3 p-4">
          <p className="text-sm font-medium">Lip sync</p>
          <p className="text-xs text-muted-foreground">
            Re-render every shot covered by a dialog track using the
            audio-conditioned LTX workflow. Each clip gets only the portion of
            the dialog that plays during it, plus speech direction in the
            prompt,             so mouths match the words. Works best when the speaker
            faces the camera in a medium shot or closer. In wide shots the face
            is too small for visible lip movement. The timeline updates in
            place when a take finishes.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-auto min-w-[220px]"
              value={lipSyncTarget || dialogCoveredShots[0]?.id || ""}
              onChange={(e) => setLipSyncTarget(e.target.value)}
              disabled={dialogCoveredShots.length === 0}
            >
              {dialogCoveredShots.map((shot, index) => (
                <option key={shot.id} value={shot.id}>
                  {shot.title?.trim() || `Shot ${index + 1}`}
                </option>
              ))}
              {dialogCoveredShots.length > 1 && (
                <option value="__all__">
                  All covered shots ({dialogCoveredShots.length})
                </option>
              )}
            </Select>
            <Button
              size="sm"
              disabled={lipSyncBusy || dialogCoveredShots.length === 0}
              onClick={() => void handleLipSyncRenders()}
            >
              {lipSyncBusy ? "Queuing lip sync render…" : "Render lip sync"}
            </Button>
          </div>
          {lipSyncMessage && (
            <p className="text-xs text-emerald-400">{lipSyncMessage}</p>
          )}
          {lipSyncProgressJob && (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (lipSyncProgressJob.status === "completed"
                        ? 1
                        : lipSyncProgressJob.progress) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {lipSyncProgressJob.status === "queued"
                  ? "Lip sync queued on ComfyUI…"
                  : lipSyncProgressJob.status === "running"
                    ? `Lip syncing ${Math.round(lipSyncProgressJob.progress * 100)}%`
                    : lipSyncProgressJob.status === "completed"
                      ? "Lip sync finished. The timeline now plays this take."
                      : lipSyncProgressJob.status === "failed"
                        ? (lipSyncProgressJob.errorMessage ??
                          "Lip sync failed.")
                        : lipSyncProgressJob.statusMessage}
              </p>
            </div>
          )}
        </Card>
      )}

      {variant === "dialog" && dialogSpeechHint && (
        <p className="text-xs text-muted-foreground">{dialogSpeechHint}</p>
      )}

      <p className="text-xs text-muted-foreground">
        {config.footerNote}{" "}
        <Link href="/settings" className="text-primary hover:underline">
          Settings
        </Link>
        .
        {variant === "dialog"
          ? " Shorter reads are padded with silence to your span."
          : " Uploaded scores keep your file as-is; generated scores are trimmed to the track span."}
      </p>

      {generateStatus && !error && (
        <p className="text-xs text-muted-foreground">{generateStatus}</p>
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
