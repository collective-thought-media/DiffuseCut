import fs from "fs";
import path from "path";
import type { CreativePack } from "./creative-pack";
import type { SurfaceResult } from "./surface-tracker";
import { surfaceCoveragePercent, surfacePassRate } from "./surface-tracker";

export interface PreflightResult {
  doctorOk: boolean;
  doctorOutput?: string;
  appReachable: boolean;
  comfyuiReachable?: boolean;
  ipAdapterAvailable?: boolean;
  compositingAvailable?: boolean;
  ltxAvailable?: boolean;
}

export interface TimingEntry {
  phase: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface ExportProbe {
  path: string | null;
  copiedTo: string | null;
  ffprobe?: Record<string, unknown> | null;
  ffprobeError?: string;
}

export interface EvalReport {
  runId: string;
  runner: string;
  modelName?: string;
  startedAt: string;
  endedAt?: string;
  projectId?: string;
  projectName?: string;
  creativePackPath: string;
  dryRun: boolean;
  skipExport: boolean;
  preflight: PreflightResult;
  surfaces: SurfaceResult[];
  surfaceCoveragePercent: number;
  surfacePassRate: number;
  timings: TimingEntry[];
  export: ExportProbe;
  knownGaps: Array<{ id: string; label: string }>;
  qualityRubric: Record<string, string>;
  errors: string[];
  notes: string[];
}

export const QUALITY_RUBRIC_PROMPTS: Record<string, string> = {
  characterIdentity:
    "Do generated character references match the written look description (wardrobe, hair, age cues)?",
  locationCoherence:
    "Does the location establishing plate match the environment description and stay consistent across angles?",
  shotComposition:
    "Do storyboard stills respect cast, location refs, and prompt framing?",
  motionPlausibility:
    "Do rendered clips show believable motion without heavy flicker or object morphing?",
  audioSync:
    "If audio was added, does preview playback stay aligned with the timeline?",
  trimCorrectness:
    "Does the exported video honor Finishing trim in/out on the deep-path shots?",
  exportOverall:
    "Overall export watchability: pacing, resolution, artifacts, and story readability.",
};

export function createEmptyReport(input: {
  runId: string;
  runner: string;
  creativePackPath: string;
  dryRun: boolean;
  skipExport: boolean;
  knownGaps: Array<{ id: string; label: string }>;
  modelName?: string;
}): EvalReport {
  return {
    runId: input.runId,
    runner: input.runner,
    modelName: input.modelName,
    startedAt: new Date().toISOString(),
    creativePackPath: input.creativePackPath,
    dryRun: input.dryRun,
    skipExport: input.skipExport,
    preflight: { doctorOk: false, appReachable: false },
    surfaces: [],
    surfaceCoveragePercent: 0,
    surfacePassRate: 0,
    timings: [],
    export: { path: null, copiedTo: null },
    knownGaps: input.knownGaps,
    qualityRubric: Object.fromEntries(
      Object.keys(QUALITY_RUBRIC_PROMPTS).map((key) => [key, ""])
    ),
    errors: [],
    notes: [],
  };
}

export function finalizeReport(
  report: EvalReport,
  surfaces: SurfaceResult[]
): EvalReport {
  report.surfaces = surfaces;
  report.surfaceCoveragePercent = surfaceCoveragePercent(surfaces);
  report.surfacePassRate = surfacePassRate(surfaces);
  report.endedAt = new Date().toISOString();
  return report;
}

export function writeReportFiles(
  runDir: string,
  report: EvalReport,
  creativePack: CreativePack
) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, "report.json"),
    JSON.stringify(report, null, 2)
  );
  fs.writeFileSync(
    path.join(runDir, "creative-pack.json"),
    JSON.stringify(creativePack, null, 2)
  );
  fs.writeFileSync(path.join(runDir, "report.md"), renderReportMarkdown(report));
}

function renderReportMarkdown(report: EvalReport): string {
  const lines: string[] = [
    `# DiffuseCut E2E Eval Report`,
    ``,
    `- Run ID: ${report.runId}`,
    `- Runner: ${report.runner}`,
    report.modelName ? `- Model: ${report.modelName}` : "",
    `- Project: ${report.projectName ?? "(none)"} (${report.projectId ?? "n/a"})`,
    `- Started: ${report.startedAt}`,
    `- Ended: ${report.endedAt ?? "in progress"}`,
    `- Dry run: ${report.dryRun ? "yes" : "no"}`,
    `- Skip export: ${report.skipExport ? "yes" : "no"}`,
    ``,
    `## Preflight`,
    ``,
    `- Doctor: ${report.preflight.doctorOk ? "ok" : "failed"}`,
    `- App reachable: ${report.preflight.appReachable ? "yes" : "no"}`,
    `- ComfyUI reachable: ${formatOptionalBool(report.preflight.comfyuiReachable)}`,
    `- IP-Adapter available: ${formatOptionalBool(report.preflight.ipAdapterAvailable)}`,
    `- Compositing available: ${formatOptionalBool(report.preflight.compositingAvailable)}`,
    ``,
    `## Surface coverage`,
    ``,
    `- Touched: ${report.surfaceCoveragePercent}%`,
    `- Pass rate (non-pending): ${report.surfacePassRate}%`,
    ``,
    `| Surface | Status | Evidence |`,
    `| --- | --- | --- |`,
  ];

  for (const surface of report.surfaces) {
    const evidence = surface.evidence ?? surface.skipReason ?? surface.error ?? "";
    lines.push(`| ${surface.label} | ${surface.status} | ${escapeCell(evidence)} |`);
  }

  lines.push(
    ``,
    `## Timings`,
    ``,
    `| Phase | Duration |`,
    `| --- | --- |`
  );
  for (const timing of report.timings) {
    lines.push(
      `| ${timing.phase} | ${Math.round(timing.durationMs / 1000)}s |`
    );
  }

  lines.push(
    ``,
    `## Export`,
    ``,
    `- Output: ${report.export.path ?? "(none)"}`,
    `- Copied to: ${report.export.copiedTo ?? "(none)"}`
  );

  if (report.export.ffprobe) {
    lines.push(`- ffprobe: \`${JSON.stringify(report.export.ffprobe)}\``);
  }
  if (report.export.ffprobeError) {
    lines.push(`- ffprobe error: ${report.export.ffprobeError}`);
  }

  lines.push(``, `## Known product gaps`, ``);
  for (const gap of report.knownGaps) {
    lines.push(`- ${gap.label}`);
  }

  lines.push(``, `## Quality rubric (fill after manual review)`, ``);
  for (const [key, prompt] of Object.entries(QUALITY_RUBRIC_PROMPTS)) {
    const answer = report.qualityRubric[key] ?? "";
    lines.push(`### ${key}`, ``, prompt, ``, `Review notes: ${answer || "(pending)"}`, ``);
  }

  if (report.errors.length > 0) {
    lines.push(`## Errors`, ``);
    for (const err of report.errors) {
      lines.push(`- ${err}`);
    }
    lines.push(``);
  }

  if (report.notes.length > 0) {
    lines.push(`## Notes`, ``);
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
    lines.push(``);
  }

  return lines.filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n");
}

function formatOptionalBool(value: boolean | undefined) {
  if (value === undefined) return "n/a";
  return value ? "yes" : "no";
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export async function tryFfprobe(
  filePath: string
): Promise<{ data?: Record<string, unknown>; error?: string }> {
  if (!fs.existsSync(filePath)) {
    return { error: "file not found" };
  }
  try {
    const { spawnSync } = await import("child_process");
    const result = spawnSync(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { encoding: "utf8" }
    );
    if (result.status !== 0) {
      return { error: result.stderr?.trim() || "ffprobe failed" };
    }
    return { data: JSON.parse(result.stdout) as Record<string, unknown> };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
