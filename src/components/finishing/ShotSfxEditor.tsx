"use client";

import { useMemo, useState } from "react";
import type { AudioTrack, Shot } from "@/lib/db/schema";
import { formatTrackSpanSummary } from "@/lib/finishing/audio-track-timing";
import { mediaUrl } from "@/lib/media-url";
import {
  Button,
  Card,
  Input,
  Label,
  NestedEntityCard,
  Textarea,
} from "@/components/ui/button";
import Link from "next/link";

export interface ShotSfxDraft {
  shotId: string;
  shotTitle: string;
  promptText: string;
}

interface ShotSfxEditorProps {
  projectId: string;
  shots: Shot[];
  tracks: AudioTrack[];
  totalFrames: number;
  fps: number;
  onChange: (tracks: AudioTrack[]) => void;
}

export function ShotSfxEditor({
  projectId,
  shots,
  tracks,
  totalFrames,
  fps,
  onChange,
}: ShotSfxEditorProps) {
  const sfxTracks = tracks.filter((track) => track.kind === "sfx");
  const [drafts, setDrafts] = useState<ShotSfxDraft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usedLlm, setUsedLlm] = useState<boolean | null>(null);

  const shotById = useMemo(
    () => new Map(shots.map((shot) => [shot.id, shot])),
    [shots]
  );

  async function handleSuggest() {
    setError(null);
    setBusy("suggest");
    setProgress(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/audio/sfx/suggest`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Suggest failed");
      setDrafts(data.suggestions ?? []);
      setUsedLlm(Boolean(data.usedLlm));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggest failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateTracks() {
    if (drafts.length === 0) {
      setError("Suggest sound effects from your shots first.");
      return;
    }

    setError(null);
    setBusy("create");
    try {
      const res = await fetch(`/api/projects/${projectId}/audio/sfx/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestions: drafts,
          replaceExisting: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      const nextTracks = tracks
        .filter((track) => track.kind !== "sfx")
        .concat(data.tracks ?? []);
      onChange(nextTracks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateAll() {
    const pending = sfxTracks.filter(
      (track) => track.promptText?.trim() && track.filePath?.includes("pending")
    );
    const targets =
      pending.length > 0
        ? pending
        : sfxTracks.filter((track) => track.promptText?.trim());

    if (targets.length === 0) {
      setError("Create SFX tracks with prompts before generating.");
      return;
    }

    setError(null);
    setBusy("generate");
    let nextTracks = [...tracks];

    for (let index = 0; index < targets.length; index += 1) {
      const track = targets[index];
      setProgress(`Generating ${index + 1} of ${targets.length}: ${track.label}`);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/audio/${track.id}/generate`,
          { method: "POST" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Generation failed");
        nextTracks = nextTracks.map((row) =>
          row.id === track.id ? data.track : row
        );
        onChange(nextTracks);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Generation failed for ${track.label}`
        );
        break;
      }
    }

    setProgress(null);
    setBusy(null);
  }

  async function handleGenerateOne(trackId: string) {
    setError(null);
    setBusy(trackId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/audio/${trackId}/generate`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      onChange(tracks.map((track) => (track.id === trackId ? data.track : track)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteTrack(trackId: string) {
    setError(null);
    setBusy(trackId);
    try {
      const res = await fetch(`/api/projects/${projectId}/audio/${trackId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      onChange(tracks.filter((track) => track.id !== trackId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function handlePatchPrompt(trackId: string, promptText: string) {
    const res = await fetch(`/api/projects/${projectId}/audio/${trackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptText }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Update failed");
    onChange(tracks.map((track) => (track.id === trackId ? data.track : track)));
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Sound Effects</h3>
        <p className="text-xs text-muted-foreground">
          Suggest realistic foley and ambience per shot from scene descriptions,
          then generate short clips mixed on the timeline with your score.
        </p>
      </div>

      <Card className="mb-0 space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy !== null || shots.length === 0}
            onClick={() => void handleSuggest()}
          >
            {busy === "suggest" ? "Analyzing shots..." : "Suggest from shots"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null || drafts.length === 0}
            onClick={() => void handleCreateTracks()}
          >
            {busy === "create" ? "Creating tracks..." : "Create SFX tracks"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null || sfxTracks.length === 0}
            onClick={() => void handleGenerateAll()}
          >
            {busy === "generate" ? "Generating..." : "Generate all SFX"}
          </Button>
        </div>
        {usedLlm !== null && (
          <p className="text-xs text-muted-foreground">
            {usedLlm
              ? "Suggestions used your configured LLM."
              : "Suggestions used shot text rules. Enable LLM in Settings for richer cues."}
          </p>
        )}
        {progress && (
          <p className="text-xs text-muted-foreground">{progress}</p>
        )}
      </Card>

      {drafts.length > 0 && (
        <Card className="mb-0 space-y-3 p-4">
          <p className="text-sm font-medium">Review suggested SFX</p>
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div key={draft.shotId} className="space-y-1.5">
                <Label htmlFor={`sfx-draft-${draft.shotId}`}>
                  {draft.shotTitle}
                </Label>
                <Textarea
                  id={`sfx-draft-${draft.shotId}`}
                  rows={3}
                  value={draft.promptText}
                  onChange={(e) =>
                    setDrafts((rows) =>
                      rows.map((row) =>
                        row.shotId === draft.shotId
                          ? { ...row, promptText: e.target.value }
                          : row
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {sfxTracks.length === 0 ? (
        <Card className="mb-0 p-4 text-center text-sm text-muted-foreground">
          No sound effect tracks yet. Suggest from shots, review the prompts,
          then create tracks and generate.
        </Card>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {sfxTracks.map((track) => {
            const shot = track.targetShotId
              ? shotById.get(track.targetShotId)
              : undefined;
            const hasFile =
              Boolean(track.filePath) && !track.filePath.includes("pending");

            return (
              <NestedEntityCard key={track.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{track.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTrackSpanSummary(track, shots, totalFrames, fps)}
                    </p>
                    {shot?.prompt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Shot: {shot.prompt.slice(0, 140)}
                        {shot.prompt.length > 140 ? "..." : ""}
                      </p>
                    )}
                  </div>
                  {hasFile && (
                    <audio
                      controls
                      preload="metadata"
                      src={mediaUrl(projectId, track.filePath, {
                        version: track.updatedAt,
                      })}
                      className="h-8 max-w-xs"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`sfx-prompt-${track.id}`}>SFX brief</Label>
                  <Textarea
                    id={`sfx-prompt-${track.id}`}
                    rows={3}
                    value={track.promptText ?? ""}
                    onChange={(e) =>
                      onChange(
                        tracks.map((row) =>
                          row.id === track.id
                            ? { ...row, promptText: e.target.value }
                            : row
                        )
                      )
                    }
                    onBlur={(e) =>
                      void handlePatchPrompt(track.id, e.target.value).catch(
                        (err) =>
                          setError(
                            err instanceof Error ? err.message : "Save failed"
                          )
                      )
                    }
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`sfx-volume-${track.id}`} className="text-xs">
                      Volume
                    </Label>
                    <Input
                      id={`sfx-volume-${track.id}`}
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={track.volume}
                      className="w-28"
                      onChange={(e) =>
                        onChange(
                          tracks.map((row) =>
                            row.id === track.id
                              ? { ...row, volume: Number(e.target.value) }
                              : row
                          )
                        )
                      }
                      onMouseUp={(e) =>
                        void fetch(`/api/projects/${projectId}/audio/${track.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            volume: Number(
                              (e.target as HTMLInputElement).value
                            ),
                          }),
                        })
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void handleGenerateOne(track.id)}
                  >
                    {busy === track.id
                      ? "Generating..."
                      : hasFile
                        ? "Regenerate"
                        : "Generate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy !== null}
                    onClick={() => void handleDeleteTrack(track.id)}
                  >
                    Remove
                  </Button>
                </div>
              </NestedEntityCard>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        SFX uses ComfyUI-Woosh on your GPU Comfy server when installed, otherwise
        ElevenLabs. Regenerate after setup changes in{" "}
        <Link href="/settings" className="text-primary hover:underline">
          Settings
        </Link>
        . ACE-Step is score only.
      </p>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
