import fs from "fs";
import path from "path";

export type SurfaceStatus = "pending" | "passed" | "skipped" | "failed";

export interface SurfaceResult {
  id: string;
  label: string;
  category: string;
  method: string;
  status: SurfaceStatus;
  timestamp?: string;
  evidence?: string;
  skipReason?: string;
  error?: string;
}

export interface SurfaceChecklistFile {
  version: number;
  description: string;
  surfaces: Array<{
    id: string;
    category: string;
    label: string;
    route: string;
    method: string;
    requiresComfyUI?: boolean;
  }>;
  knownGaps: Array<{ id: string; label: string }>;
}

export function loadSurfaceChecklist(rootDir: string): SurfaceChecklistFile {
  const filePath = path.join(rootDir, "scripts/eval/surface-checklist.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as SurfaceChecklistFile;
}

export function initSurfaceResults(
  checklist: SurfaceChecklistFile
): SurfaceResult[] {
  return checklist.surfaces.map((surface) => ({
    id: surface.id,
    label: surface.label,
    category: surface.category,
    method: surface.method,
    status: "pending",
  }));
}

export function markSurface(
  results: SurfaceResult[],
  id: string,
  patch: Partial<Pick<SurfaceResult, "status" | "evidence" | "skipReason" | "error">>
) {
  const entry = results.find((r) => r.id === id);
  if (!entry) {
    throw new Error(`Unknown surface id: ${id}`);
  }
  Object.assign(entry, patch, { timestamp: new Date().toISOString() });
}

export function surfaceCoveragePercent(results: SurfaceResult[]): number {
  if (results.length === 0) return 0;
  const touched = results.filter((r) => r.status !== "pending").length;
  return Math.round((touched / results.length) * 100);
}

export function surfacePassRate(results: SurfaceResult[]): number {
  const applicable = results.filter((r) => r.status !== "pending");
  if (applicable.length === 0) return 0;
  const passed = applicable.filter((r) => r.status === "passed").length;
  return Math.round((passed / applicable.length) * 100);
}
