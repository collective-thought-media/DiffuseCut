"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExportJob } from "@/lib/db/schema";
import { Button, Card, Label, Badge, Select } from "@/components/ui/button";
import { mediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";

type ExportEncoderPanelProps = {
  projectId: string;
  fps: number;
  renderedCount: number;
  shotCount: number;
  initialJob?: ExportJob | null;
  /** Configured render size, used to flag when the encoder output differs. */
  configuredWidth?: number | null;
  configuredHeight?: number | null;
};

type ExportOutputMeta = {
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  overlayCount?: number;
  audioSource?: "shots" | "shots+tracks" | "none";
};

function parseOutputMeta(json: string | null | undefined): ExportOutputMeta | null {
  if (!json?.trim()) return null;
  try {
    return JSON.parse(json) as ExportOutputMeta;
  } catch {
    return null;
  }
}

function audioSourceLabel(source: ExportOutputMeta["audioSource"]): string {
  if (source === "shots+tracks") return "shot audio + score/SFX mix";
  if (source === "shots") return "shot audio";
  return "none";
}

function statusLabel(status: ExportJob["status"]): string {
  switch (status) {
    case "queued":
      return "Waiting in queue";
    case "running":
      return "Encoding";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function ExportEncoderPanel({
  projectId,
  fps,
  renderedCount,
  shotCount,
  initialJob = null,
  configuredWidth = null,
  configuredHeight = null,
}: ExportEncoderPanelProps) {
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [job, setJob] = useState<ExportJob | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<"reveal" | "open" | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive =
    job?.status === "queued" || job?.status === "running";
  const isComplete = job?.status === "completed";
  const progressPct = Math.round(Math.min(100, Math.max(0, (job?.progress ?? 0) * 100)));

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/export/${jobId}`);
          const data = await res.json();
          if (!res.ok || !data.job) return;

          setJob(data.job);

          if (
            data.job.status === "completed" ||
            data.job.status === "failed" ||
            data.job.status === "cancelled"
          ) {
            stopPolling();
            if (data.job.status === "failed") {
              setError(data.job.errorMessage ?? "Export failed");
            }
          }
        } catch {
          /* keep polling */
        }
      }, 750);
    },
    [stopPolling]
  );

  useEffect(() => {
    if (
      initialJob &&
      (initialJob.status === "queued" || initialJob.status === "running")
    ) {
      pollJob(initialJob.id);
    }
    return () => stopPolling();
  }, [initialJob, pollJob, stopPolling]);

  async function handleExport() {
    setError(null);
    setJob(null);
    stopPolling();

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          settings: { fps, format, includeAudio: true },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export failed");

      const created = data.job as ExportJob | undefined;
      const jobId = data.jobId ?? created?.id;
      if (!jobId) throw new Error("Export job was not created.");

      setJob(
        created ?? {
          id: jobId,
          projectId,
          status: "queued",
          progress: 0,
          progressMessage: "Queued…",
          outputPath: null,
          outputMetaJson: null,
          settingsJson: "{}",
          errorMessage: null,
          previewFramePath: null,
          currentFrame: 0,
          totalFrames: null,
          createdAt: Date.now(),
          completedAt: null,
        }
      );
      pollJob(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function handleReveal(action: "reveal" | "open") {
    if (!job?.id) return;
    setOpening(action);
    setError(null);
    try {
      const res = await fetch(`/api/export/${job.id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open file");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open file");
    } finally {
      setOpening(null);
    }
  }

  const previewSrc =
    job?.previewFramePath && job.previewFramePath.length > 0
      ? mediaUrl(projectId, job.previewFramePath, {
          version: job.completedAt ?? job.createdAt,
        })
      : null;

  const outputSrc =
    isComplete && job.outputPath
      ? mediaUrl(projectId, job.outputPath, {
          version: job.completedAt ?? job.createdAt,
        })
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Export queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {renderedCount} / {shotCount} shots rendered · {fps} fps
            </p>
          </div>
          {job ? (
            <Badge
              className={cn(
                job.status === "completed" && "bg-emerald-700 text-white",
                job.status === "failed" && "bg-red-800 text-white",
                job.status === "running" && "bg-primary text-primary-foreground"
              )}
            >
              {statusLabel(job.status)}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="export-format">Format</Label>
            <Select
              id="export-format"
              value={format}
              disabled={isActive}
              onChange={(e) => setFormat(e.target.value as "mp4" | "webm")}
            >
              <option value="mp4">MP4 (H.264)</option>
              <option value="webm">WebM</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Audio</Label>
            <Badge>Score + SFX from Finishing</Badge>
          </div>
        </div>

        <Button
          onClick={() => void handleExport()}
          disabled={isActive || shotCount === 0 || renderedCount === 0}
          size="lg"
        >
          {isActive ? "Exporting…" : isComplete ? "Export again" : "Export final video"}
        </Button>

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {(isActive || isComplete || job?.status === "failed") && job ? (
          <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {job.progressMessage ?? statusLabel(job.status)}
              </span>
              <span className="tabular-nums text-foreground">{progressPct}%</span>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  job.status === "failed" ? "bg-red-500" : "bg-primary"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {job.currentFrame != null && job.totalFrames != null ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                Frame {Math.min(job.currentFrame, job.totalFrames)} of{" "}
                {job.totalFrames}
              </p>
            ) : null}

            {isComplete && job.outputPath ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={opening !== null}
                  onClick={() => void handleReveal("open")}
                >
                  {opening === "open" ? "Opening…" : "Open file"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={opening !== null}
                  onClick={() => void handleReveal("reveal")}
                >
                  {opening === "reveal" ? "Opening…" : "Show in folder"}
                </Button>
              </div>
            ) : null}

            {isComplete
              ? (() => {
                  const meta = parseOutputMeta(job.outputMetaJson);
                  if (!meta) return null;
                  const parts: string[] = [];
                  if (meta.width && meta.height) {
                    parts.push(`${meta.width}x${meta.height}`);
                  }
                  if (meta.durationSeconds != null) {
                    parts.push(`${meta.durationSeconds.toFixed(1)}s`);
                  }
                  parts.push(
                    meta.overlayCount
                      ? `${meta.overlayCount} overlay${meta.overlayCount === 1 ? "" : "s"} burned in`
                      : "no overlays"
                  );
                  parts.push(`audio: ${audioSourceLabel(meta.audioSource)}`);

                  const sizeDiffers =
                    meta.width != null &&
                    meta.height != null &&
                    configuredWidth != null &&
                    configuredHeight != null &&
                    (meta.width !== configuredWidth ||
                      meta.height !== configuredHeight);

                  return (
                    <div className="space-y-1 pt-1">
                      <p className="text-xs text-muted-foreground">
                        {parts.join(" · ")}
                      </p>
                      {sizeDiffers ? (
                        <p className="text-xs text-amber-400">
                          Output is {meta.width}x{meta.height}, while the
                          configured render size is {configuredWidth}x
                          {configuredHeight}. The video model rounds to its
                          supported dimensions.
                        </p>
                      ) : null}
                    </div>
                  );
                })()
              : null}

            {isComplete && job.outputPath ? (
              <p className="break-all text-xs text-muted-foreground">
                {job.outputPath}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-neutral-800 px-4 py-3">
          <h3 className="text-sm font-medium">Preview</h3>
          <p className="text-xs text-muted-foreground">
            {isActive
              ? "Updating every 10 frames while encoding"
              : isComplete
                ? "Final export"
                : "Frame preview appears during export"}
          </p>
        </div>
        <div className="aspect-video bg-black">
          {outputSrc && isComplete ? (
            <video
              key={outputSrc}
              src={outputSrc}
              controls
              className="h-full w-full object-contain"
            />
          ) : previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt="Export frame preview"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {isActive
                ? "Waiting for the next preview frame…"
                : "Start an export to see progress here."}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
