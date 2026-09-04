import type { RenderJob, Shot } from "@/lib/db/schema";

export type ShotRenderDisplayStatus =
  | "pending"
  | "queued"
  | "rendering"
  | "rendered"
  | "failed";

export interface ShotRenderDisplay {
  shotId: string;
  displayStatus: ShotRenderDisplayStatus;
  activeJob: RenderJob | null;
  latestJob: RenderJob | null;
  /** Most recent completed job with output (stable preview during re-render). */
  completedJob: RenderJob | null;
  progress: number;
  statusMessage: string | null;
  errorMessage: string | null;
  playablePath: string | null;
  showingPriorRender: boolean;
}

function jobsForShot(shotId: string, jobs: RenderJob[]): RenderJob[] {
  return jobs
    .filter((job) => job.shotId === shotId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getActiveJobForShot(
  shotId: string,
  jobs: RenderJob[]
): RenderJob | null {
  const shotJobs = jobsForShot(shotId, jobs);
  return (
    shotJobs.find((job) => job.status === "running") ??
    shotJobs.find((job) => job.status === "queued") ??
    null
  );
}

function lastCompletedJob(shotJobs: RenderJob[]): RenderJob | null {
  return shotJobs.find((job) => job.status === "completed") ?? null;
}

export function deriveShotRenderDisplay(
  shot: Shot,
  jobs: RenderJob[]
): ShotRenderDisplay {
  const shotJobs = jobsForShot(shot.id, jobs);
  const latestJob = shotJobs[0] ?? null;
  const activeJob = getActiveJobForShot(shot.id, jobs);
  const completedJob = lastCompletedJob(shotJobs);
  const playableFromJob = completedJob?.outputPath ?? null;
  const playablePath = playableFromJob ?? shot.videoPath ?? null;

  const showingPriorRender =
    Boolean(playablePath) &&
    activeJob != null &&
    activeJob.status !== "completed";

  let displayStatus: ShotRenderDisplayStatus = "pending";
  if (activeJob?.status === "running") {
    displayStatus = "rendering";
  } else if (activeJob?.status === "queued") {
    displayStatus = showingPriorRender ? "rendered" : "queued";
  } else if (latestJob?.status === "failed" && !playablePath) {
    displayStatus = "failed";
  } else if (playablePath) {
    displayStatus = "rendered";
  } else if (shot.renderStatus === "failed") {
    displayStatus = "failed";
  }

  const progress = activeJob?.progress ?? latestJob?.progress ?? 0;
  const statusMessage = showingPriorRender
    ? activeJob?.status === "running"
      ? (activeJob.statusMessage ?? "Re-rendering on ComfyUI")
      : "Re-render queued"
    : (activeJob?.statusMessage ?? latestJob?.statusMessage ?? null);

  return {
    shotId: shot.id,
    displayStatus,
    activeJob,
    latestJob,
    completedJob,
    progress,
    statusMessage,
    errorMessage: activeJob?.errorMessage ?? latestJob?.errorMessage ?? null,
    playablePath,
    showingPriorRender,
  };
}

/** Stable cache-bust token for shot preview media URLs. */
export function previewMediaVersion(
  display: ShotRenderDisplay
): number | string | undefined {
  if (display.showingPriorRender) {
    return (
      display.completedJob?.completedAt ??
      display.completedJob?.createdAt ??
      undefined
    );
  }

  if (display.latestJob?.status === "completed") {
    return (
      display.latestJob.completedAt ??
      display.latestJob.createdAt ??
      undefined
    );
  }

  return display.activeJob?.lastHeartbeatAt ?? undefined;
}

export function shotHasActiveRenderJob(
  shotId: string,
  jobs: RenderJob[]
): boolean {
  return getActiveJobForShot(shotId, jobs) != null;
}

export function shotDisplayStatusLabel(
  status: ShotRenderDisplayStatus,
  options?: { showingPriorRender?: boolean; activeJobStatus?: RenderJob["status"] }
): string {
  if (options?.showingPriorRender) {
    if (options.activeJobStatus === "running") return "re-rendering";
    if (options.activeJobStatus === "queued") return "re-queue";
  }

  switch (status) {
    case "rendered":
      return "rendered";
    case "rendering":
      return "rendering";
    case "queued":
      return "queued";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

export function shotDisplayStatusVariant(
  status: ShotRenderDisplayStatus
): "default" | "success" | "warning" | "error" {
  if (status === "rendered") return "success";
  if (status === "rendering" || status === "queued") return "warning";
  if (status === "failed") return "error";
  return "default";
}
