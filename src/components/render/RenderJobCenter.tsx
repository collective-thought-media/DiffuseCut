"use client";

import { useEffect, useMemo } from "react";
import type { RenderJob, Shot } from "@/lib/db/schema";
import {
  deriveShotRenderDisplay,
  previewMediaVersion,
  shotDisplayStatusLabel,
  shotDisplayStatusVariant,
  type ShotRenderDisplay,
} from "@/lib/render-shot-display";
import { mediaUrl } from "@/lib/media-url";
import { JobProgressCard } from "@/components/render/JobProgressCard";
import { Badge, Card } from "@/components/ui/button";

interface RenderJobCenterProps {
  projectId: string;
  jobs: RenderJob[];
  shots: Shot[];
  shotTitleMap: Record<string, string>;
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onCancel: (jobId: string) => void;
}

function sortShotsByOrder(shots: Shot[]): Shot[] {
  return [...shots].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt - b.createdAt;
  });
}

export function pickDefaultShotId(
  displays: ShotRenderDisplay[],
  shots: Shot[]
): string | null {
  const ordered = sortShotsByOrder(shots);
  const displayByShot = new Map(displays.map((d) => [d.shotId, d]));

  for (const shot of ordered) {
    const display = displayByShot.get(shot.id);
    if (display?.displayStatus === "rendering") return shot.id;
  }
  for (const shot of ordered) {
    const display = displayByShot.get(shot.id);
    if (display?.displayStatus === "queued") return shot.id;
  }
  for (const shot of ordered) {
    const display = displayByShot.get(shot.id);
    if (display?.displayStatus === "failed") return shot.id;
  }
  for (const shot of ordered) {
    const display = displayByShot.get(shot.id);
    if (display?.displayStatus === "rendered") return shot.id;
  }
  return ordered[0]?.id ?? null;
}

function displayLabel(display: ShotRenderDisplay): string {
  return shotDisplayStatusLabel(display.displayStatus, {
    showingPriorRender: display.showingPriorRender,
    activeJobStatus: display.activeJob?.status,
  });
}

function displayVariant(display: ShotRenderDisplay) {
  if (display.showingPriorRender && display.activeJob?.status === "running") {
    return "warning" as const;
  }
  if (display.showingPriorRender && display.activeJob?.status === "queued") {
    return "success" as const;
  }
  return shotDisplayStatusVariant(display.displayStatus);
}

function jobForCard(display: ShotRenderDisplay): RenderJob | null {
  const job = display.activeJob ?? display.latestJob;
  if (!job) return null;

  if (display.showingPriorRender) {
    return {
      ...job,
      progress: display.progress,
      status: display.activeJob?.status ?? job.status,
      statusMessage: display.statusMessage ?? job.statusMessage,
    };
  }

  if (display.displayStatus === "rendered" && !display.activeJob) {
    return {
      ...job,
      progress: 1,
      status: "completed",
      statusMessage: "Completed",
    };
  }

  return {
    ...job,
    progress: display.progress,
    statusMessage: display.statusMessage ?? job.statusMessage,
  };
}

const renderPaneCard = "mb-0 flex flex-col gap-4 p-4";

export function RenderJobCenter({
  projectId,
  jobs,
  shots,
  shotTitleMap,
  selectedShotId,
  onSelectShot,
  onCancel,
}: RenderJobCenterProps) {
  const orderedShots = useMemo(() => sortShotsByOrder(shots), [shots]);

  const displays = useMemo(
    () => orderedShots.map((shot) => deriveShotRenderDisplay(shot, jobs)),
    [orderedShots, jobs]
  );

  const displayByShotId = useMemo(
    () => new Map(displays.map((display) => [display.shotId, display])),
    [displays]
  );

  useEffect(() => {
    if (selectedShotId && displayByShotId.has(selectedShotId)) return;
    const fallback = pickDefaultShotId(displays, orderedShots);
    if (fallback) onSelectShot(fallback);
  }, [displays, orderedShots, selectedShotId, displayByShotId, onSelectShot]);

  const selectedDisplay = selectedShotId
    ? displayByShotId.get(selectedShotId)
    : null;
  const selectedJob = selectedDisplay?.activeJob ?? selectedDisplay?.latestJob;

  const runningCount = displays.filter(
    (display) => display.displayStatus === "rendering"
  ).length;

  const activeRunningDisplay = displays.find(
    (display) => display.displayStatus === "rendering"
  );

  const showRenderingElsewhere =
    activeRunningDisplay &&
    selectedDisplay?.displayStatus === "queued" &&
    !selectedDisplay.showingPriorRender &&
    activeRunningDisplay.shotId !== selectedDisplay.shotId;

  if (orderedShots.length === 0) {
    return (
      <Card
        className={`${renderPaneCard} min-h-[420px] items-center justify-center text-center text-muted-foreground`}
      >
        <p className="text-sm">No storyboard shots yet.</p>
        <p className="mt-2 max-w-sm text-xs">
          Add shots on the Storyboard page, then queue them here for video
          renders.
        </p>
      </Card>
    );
  }

  const media = (() => {
    if (!selectedDisplay?.playablePath) {
      return { kind: "none" as const, src: null, cacheKey: null };
    }
    const version = previewMediaVersion(selectedDisplay);
    const lower = selectedDisplay.playablePath.toLowerCase();
    if (
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".mov")
    ) {
      return {
        kind: "video" as const,
        src: mediaUrl(projectId, selectedDisplay.playablePath, { version }),
        cacheKey: `${selectedDisplay.shotId}:${selectedDisplay.playablePath}:${version ?? "stable"}`,
      };
    }
    return {
      kind: "image" as const,
      src: mediaUrl(projectId, selectedDisplay.playablePath, { version }),
      cacheKey: `${selectedDisplay.shotId}:${selectedDisplay.playablePath}:${version ?? "stable"}`,
    };
  })();

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {selectedDisplay && (
        <Card className={`${renderPaneCard} shrink-0`}>
          <div className="flex shrink-0 items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Shot preview</h3>
            {runningCount > 0 && (
              <Badge variant="warning">{runningCount} rendering</Badge>
            )}
          </div>

          <div className="flex min-h-[52px] items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {shotTitleMap[selectedDisplay.shotId] ?? selectedDisplay.shotId}
              </p>
            </div>
            <Badge className="shrink-0" variant={displayVariant(selectedDisplay)}>
              {displayLabel(selectedDisplay)}
            </Badge>
          </div>

          {selectedDisplay.showingPriorRender && (
            <p className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
              Showing the last rendered video while a new render is queued or
              in progress.
            </p>
          )}

          {showRenderingElsewhere && activeRunningDisplay && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {shotTitleMap[activeRunningDisplay.shotId] ?? "Another shot"} is
              rendering on ComfyUI now. This shot is waiting in queue.
            </p>
          )}

          <div className="relative aspect-video max-h-[min(42vh,520px)] w-full shrink-0 overflow-hidden rounded-lg bg-black">
            {media.kind === "video" && media.src ? (
              <video
                key={media.cacheKey ?? media.src}
                src={media.src}
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : media.kind === "image" && media.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={media.cacheKey ?? media.src}
                src={media.src}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm">
                {selectedDisplay.displayStatus === "failed" &&
                selectedDisplay.errorMessage ? (
                  <p className="text-red-400">{selectedDisplay.errorMessage}</p>
                ) : selectedDisplay.displayStatus === "rendering" ? (
                  <p className="text-muted-foreground">
                    Preview will appear when ComfyUI emits a frame.
                  </p>
                ) : selectedDisplay.displayStatus === "queued" ? (
                  <p className="text-muted-foreground">
                    Waiting to start on ComfyUI.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    No render yet for this shot.
                  </p>
                )}
              </div>
            )}
          </div>

          {selectedJob ? (
            <JobProgressCard
              job={jobForCard(selectedDisplay) ?? selectedJob}
              shotTitle={shotTitleMap[selectedDisplay.shotId]}
              onCancel={onCancel}
              variant="inline"
              stableLayout
            />
          ) : selectedDisplay.displayStatus === "rendered" ? (
            <p className="text-xs text-muted-foreground">
              Render complete. Use the player above to review this shot.
            </p>
          ) : null}
        </Card>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <h3 className="shrink-0 text-sm font-medium text-muted-foreground">
          All shots
        </h3>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-4 pb-1">
            {displays.map((display) => {
              const job = jobForCard(display);
              const isSelected = display.shotId === selectedShotId;

              if (job) {
                return (
                  <JobProgressCard
                    key={display.shotId}
                    job={job}
                    shotTitle={shotTitleMap[display.shotId]}
                    onCancel={onCancel}
                    variant="compact"
                    selected={isSelected}
                    onSelect={() => onSelectShot(display.shotId)}
                  />
                );
              }

              return (
                <button
                  key={display.shotId}
                  type="button"
                  onClick={() => onSelectShot(display.shotId)}
                  className={`rounded-lg border bg-neutral-900 p-3 text-left transition-colors hover:border-neutral-600 ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-neutral-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">
                      {shotTitleMap[display.shotId] ?? display.shotId}
                    </p>
                    <Badge variant={displayVariant(display)}>
                      {displayLabel(display)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Not queued yet
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
