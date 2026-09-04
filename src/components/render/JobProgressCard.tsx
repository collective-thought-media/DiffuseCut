"use client";

import type { RenderJob } from "@/lib/db/schema";
import {
  renderJobStatusLabel,
  renderJobStatusVariant,
} from "@/lib/render-status-labels";
import { Card, Badge, Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JobProgressCardProps {
  job: RenderJob;
  shotTitle?: string;
  onCancel?: (jobId: string) => void;
  variant?: "default" | "compact" | "inline";
  selected?: boolean;
  onSelect?: () => void;
  /** Keep featured player footer height stable when switching jobs. */
  stableLayout?: boolean;
}

function statusVariant(status: RenderJob["status"]) {
  return renderJobStatusVariant(status);
}
export function JobProgressCard({
  job,
  shotTitle,
  onCancel,
  variant = "default",
  selected = false,
  onSelect,
  stableLayout = false,
}: JobProgressCardProps) {
  const progressPct = Math.round(job.progress * 100);
  const canCancel = job.status === "queued" || job.status === "running";

  if (variant === "inline") {
    const statusText =
      job.errorMessage ??
      job.statusMessage ??
      (job.currentNodeLabel ? job.currentNodeLabel : "\u00a0");

    return (
      <div className={stableLayout ? "flex min-h-[88px] flex-col justify-end space-y-2" : "space-y-2"}>
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex min-h-4 justify-between text-xs text-muted-foreground">
            <span>{progressPct}%</span>
            {!stableLayout && job.currentNodeLabel && (
              <span>{job.currentNodeLabel}</span>
            )}
            {stableLayout && (
              <span className="truncate pl-2">
                {job.currentNodeLabel ?? "\u00a0"}
              </span>
            )}
          </div>
        </div>

        {stableLayout ? (
          <>
            <p
              className={`min-h-4 truncate text-xs ${
                job.errorMessage ? "text-red-400" : "text-muted-foreground"
              }`}
            >
              {statusText}
            </p>
            <div className="h-8">
              {canCancel && onCancel ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCancel(job.id)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {job.statusMessage && (
              <p className="text-xs text-muted-foreground">{job.statusMessage}</p>
            )}

            {job.errorMessage && (
              <p className="text-xs text-red-400">{job.errorMessage}</p>
            )}

            {canCancel && onCancel && (
              <Button size="sm" variant="outline" onClick={() => onCancel(job.id)}>
                Cancel
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (!onSelect) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "rounded-lg border border-neutral-800 bg-neutral-900 p-3 transition-colors",
          selected && "border-primary bg-primary/5",
          onSelect &&
            !selected &&
            "cursor-pointer hover:border-neutral-600 hover:bg-neutral-900/80"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">
            {shotTitle ?? job.shotId}
          </p>
          <Badge variant={statusVariant(job.status)} className="shrink-0">
            {renderJobStatusLabel(job.status)}
          </Badge>        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{progressPct}%</span>
          <span className="truncate text-right">
            {job.statusMessage ??
              job.currentNodeLabel ??
              (job.status === "running" ? "Rendering on ComfyUI" : "")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{shotTitle ?? job.shotId}</p>
          <p className="text-xs text-muted-foreground">
            {job.comfyuiEndpointUrl}
          </p>
        </div>
        <Badge variant={statusVariant(job.status)}>
          {renderJobStatusLabel(job.status)}
        </Badge>      </div>

      <div className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progressPct}%</span>
          {job.currentNodeLabel && <span>{job.currentNodeLabel}</span>}
        </div>
      </div>

      {job.statusMessage && (
        <p className="text-xs text-muted-foreground">{job.statusMessage}</p>
      )}

      {job.errorMessage && (
        <p className="text-xs text-red-400">{job.errorMessage}</p>
      )}

      {canCancel && onCancel && (
        <Button size="sm" variant="outline" onClick={() => onCancel(job.id)}>
          Cancel
        </Button>
      )}
    </Card>
  );
}
