import type { RenderJob, Shot } from "@/lib/db/schema";

export type RenderStatusBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error";

/** User-facing label for a render job row (center column). */
export function renderJobStatusLabel(
  status: RenderJob["status"]
): string {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "rendering";
    case "completed":
      return "rendered";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return status;
  }
}

export function renderJobStatusVariant(
  status: RenderJob["status"]
): RenderStatusBadgeVariant {
  if (status === "completed") return "success";
  if (status === "running" || status === "queued") return "warning";
  if (status === "failed" || status === "cancelled") return "error";
  return "default";
}

/** User-facing label for a shot in the queue panel (left column). */
export function shotRenderStatusLabel(
  status: Shot["renderStatus"]
): string {
  switch (status) {
    case "done":
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

export function shotRenderStatusVariant(
  status: Shot["renderStatus"]
): RenderStatusBadgeVariant {
  if (status === "done") return "success";
  if (status === "rendering" || status === "queued") return "warning";
  if (status === "failed") return "error";
  return "default";
}
