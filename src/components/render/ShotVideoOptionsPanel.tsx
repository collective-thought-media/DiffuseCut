"use client";

import { useMemo, useState } from "react";
import type { RenderJob, Shot } from "@/lib/db/schema";
import { videoEngineLabelForTemplate } from "@/lib/db/builtin-template-ids";
import { mediaUrl } from "@/lib/media-url";
import { Badge, Button } from "@/components/ui/button";

interface ShotVideoOptionsPanelProps {
  projectId: string;
  shot: Shot;
  jobs: RenderJob[];
  onShotUpdated: (shot: Shot) => void;
}

function formatWhen(ts: number | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ShotVideoOptionsPanel({
  projectId,
  shot,
  jobs,
  onShotUpdated,
}: ShotVideoOptionsPanelProps) {
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    return jobs
      .filter(
        (job) =>
          job.shotId === shot.id &&
          job.status === "completed" &&
          Boolean(job.outputPath)
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [jobs, shot.id]);

  if (options.length === 0) {
    return null;
  }

  async function handleSelect(jobId: string) {
    setError(null);
    setSelectingId(jobId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/shots/${shot.id}/select-video`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not select that render");
      }
      onShotUpdated(data.shot as Shot);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not select that render"
      );
    } finally {
      setSelectingId(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-neutral-800 pt-3">
      <div>
        <h4 className="text-sm font-medium">Video generations</h4>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Pick which completed render Finishing and export use for this shot.
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((job) => {
          const selected = shot.videoPath === job.outputPath;
          const preview = job.previewImagePath
            ? mediaUrl(projectId, job.previewImagePath)
            : job.outputPath
              ? mediaUrl(projectId, job.outputPath)
              : null;
          const engine = videoEngineLabelForTemplate(job.workflowTemplateId);
          const busy = selectingId === job.id;

          return (
            <div
              key={job.id}
              className={`overflow-hidden rounded-lg border bg-neutral-950 ${
                selected
                  ? "border-primary ring-1 ring-primary/40"
                  : "border-neutral-800"
              }`}
            >
              <div className="relative aspect-video bg-black">
                {preview ? (
                  <video
                    src={preview}
                    muted
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    No preview
                  </div>
                )}
              </div>
              <div className="space-y-2 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={selected ? "success" : "default"}>
                    {engine}
                  </Badge>
                  {selected && (
                    <Badge variant="success">In finishing</Badge>
                  )}
                  {job.lipSyncAudioPath && (
                    <Badge variant="default">Lip sync</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {formatWhen(job.completedAt ?? job.createdAt)}
                  {job.frameCount ? ` · ${job.frameCount}f` : ""}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={selected ? "outline" : "default"}
                  disabled={selected || busy || selectingId !== null}
                  onClick={() => void handleSelect(job.id)}
                  className="w-full"
                >
                  {busy
                    ? "Selecting…"
                    : selected
                      ? "Current for finishing"
                      : "Use for finishing"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
