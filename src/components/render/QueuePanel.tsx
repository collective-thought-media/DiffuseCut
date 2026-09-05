"use client";

import type { RenderJob, Shot } from "@/lib/db/schema";
import {
  deriveShotRenderDisplay,
  displayIsLipSync,
  shotDisplayStatusLabel,
  shotDisplayStatusVariant,
  shotHasActiveRenderJob,
} from "@/lib/render-shot-display";
import { Button, Card, Badge } from "@/components/ui/button";

interface QueuePanelProps {
  shots: Shot[];
  jobs: RenderJob[];
  selectedShotIds: string[];
  selectedPreviewShotId?: string | null;
  onSelectPreviewShot?: (shotId: string) => void;
  onToggleShot: (shotId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onQueue: () => void;
  queueing: boolean;
  templateSelected?: boolean;
  settingsReady?: boolean;
  comfyReady?: boolean;
  className?: string;
  fillHeight?: boolean;
}

function isShotQueueLocked(shot: Shot, jobs: RenderJob[]): boolean {
  return shotHasActiveRenderJob(shot.id, jobs);
}

export function QueuePanel({
  shots,
  jobs,
  selectedShotIds,
  selectedPreviewShotId = null,
  onSelectPreviewShot,
  onToggleShot,
  onSelectAll,
  onClearSelection,
  onQueue,
  queueing,
  templateSelected = true,
  settingsReady = true,
  comfyReady = true,
  className,
  fillHeight = false,
}: QueuePanelProps) {
  const queueableShots = shots.filter(
    (shot) => !isShotQueueLocked(shot, jobs)
  );

  return (
    <Card
      className={`mb-0 flex flex-col gap-4 p-4 ${fillHeight ? "min-h-0 flex-1" : ""} ${className ?? ""}`}
    >
      <div className="flex shrink-0 items-center justify-between">
        <h3 className="text-sm font-medium">Render queue</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onSelectAll}>
            All
          </Button>
          <Button size="sm" variant="ghost" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
      </div>

      <div
        className={`scrollbar-thin space-y-1 overflow-y-auto pr-1 ${fillHeight ? "min-h-0 flex-1" : "max-h-64"}`}
      >
        {shots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No storyboard shots yet.
          </p>
        ) : (
          shots.map((shot) => {
            const display = deriveShotRenderDisplay(shot, jobs);
            const locked = isShotQueueLocked(shot, jobs);
            const isPreviewSelected = selectedPreviewShotId === shot.id;
            const label = shotDisplayStatusLabel(display.displayStatus, {
              showingPriorRender: display.showingPriorRender,
              activeJobStatus: display.activeJob?.status,
              lipSync: displayIsLipSync(display),
            });
            const badgeVariant =
              display.showingPriorRender &&
              display.activeJob?.status === "running"
                ? "warning"
                : display.showingPriorRender &&
                    display.activeJob?.status === "queued"
                  ? "success"
                  : shotDisplayStatusVariant(display.displayStatus);

            return (
              <div
                key={shot.id}
                title={
                  shot.prompt.trim()
                    ? shot.prompt
                    : "No storyboard prompt on this shot"
                }
                className={`rounded-md px-2 py-1.5 ${
                  isPreviewSelected
                    ? "bg-primary/10 ring-1 ring-primary/40"
                    : locked
                      ? "opacity-60"
                      : "hover:bg-neutral-900"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedShotIds.includes(shot.id)}
                    disabled={locked}
                    onChange={() => onToggleShot(shot.id)}
                    onClick={(event) => event.stopPropagation()}
                    className="mt-0.5 accent-primary"
                  />
                  <button
                    type="button"
                    disabled={!onSelectPreviewShot}
                    onClick={() => onSelectPreviewShot?.(shot.id)}
                    className={`min-w-0 flex-1 text-left ${
                      onSelectPreviewShot ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium">
                        {shot.title || "Untitled"}
                      </span>
                      <Badge
                        variant={badgeVariant}
                        className="shrink-0 text-[10px]"
                      >
                        {label}
                      </Badge>
                    </span>
                    {display.displayStatus === "rendering" ||
                    (display.showingPriorRender &&
                      display.activeJob?.status === "running") ? (
                      <span className="mt-1 block text-[10px] text-amber-300">
                        {Math.round(display.progress * 100)}% on ComfyUI
                      </span>
                    ) : display.showingPriorRender ? (
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        Video ready, re-render waiting
                      </span>
                    ) : shot.prompt.trim() ? (
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {shot.prompt}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[10px] text-amber-400">
                        Missing storyboard prompt
                      </span>
                    )}
                  </button>
                  <Badge className="shrink-0 text-[10px]">
                    {shot.durationFrames}f
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="mt-auto shrink-0 space-y-2">
        <Button
          onClick={onQueue}
          disabled={
            queueing ||
            selectedShotIds.length === 0 ||
            !templateSelected ||
            !settingsReady ||
            !comfyReady
          }
          className="w-full"
        >
          {queueing
            ? "Queueing…"
            : !templateSelected
              ? "Select a workflow template first"
              : !settingsReady
                ? "Waiting for render settings"
                : !comfyReady
                  ? "Configure ComfyUI endpoint first"
                  : `Queue ${selectedShotIds.length} shot${selectedShotIds.length === 1 ? "" : "s"}`}
        </Button>
        {queueableShots.length === 0 && shots.length > 0 && (
          <p className="text-xs text-muted-foreground">
            All shots are currently queued or rendering.
          </p>
        )}
        {!templateSelected && selectedShotIds.length > 0 && (
          <p className="text-xs text-amber-400">
            Import a shot video workflow template before queueing renders.
          </p>
        )}
        {templateSelected && !settingsReady && selectedShotIds.length > 0 && (
          <p className="text-xs text-amber-400">
            Still missing models ComfyUI could not auto-detect. Check Render
            settings on the right.
          </p>
        )}
        {templateSelected &&
          settingsReady &&
          !comfyReady &&
          selectedShotIds.length > 0 && (
            <p className="text-xs text-amber-400">
              Add a reachable ComfyUI URL in Settings before queueing.
            </p>
          )}
      </div>
    </Card>
  );
}

export function JobListSummary({ jobs }: { jobs: RenderJob[] }) {
  const active = jobs.filter(
    (j) => j.status === "queued" || j.status === "running"
  );
  if (active.length === 0) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {active.length} active job{active.length === 1 ? "" : "s"}
    </p>
  );
}
