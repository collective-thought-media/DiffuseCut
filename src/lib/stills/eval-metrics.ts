import fs from "fs";
import path from "path";
import type { StillBrief } from "./still-brief";
import {
  AUTOMATED_THRESHOLDS,
  type AutomatedStillChecks,
} from "./eval-rubric";

/**
 * Cheap color-histogram distance in 0..1+ range for continuity smoke tests.
 * Not a face recognizer. Use as a regression tripwire, not a quality claim.
 */
export async function histogramDistance(
  imageA: string,
  imageB: string
): Promise<number> {
  const sharp = (await import("sharp")).default;
  const bins = 16;
  async function hist(file: string): Promise<Float64Array> {
    const { data } = await sharp(file)
      .resize(64, 64, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const h = new Float64Array(bins * 3);
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      h[Math.min(bins - 1, Math.floor((r / 256) * bins))] += 1;
      h[bins + Math.min(bins - 1, Math.floor((g / 256) * bins))] += 1;
      h[bins * 2 + Math.min(bins - 1, Math.floor((b / 256) * bins))] += 1;
    }
    let sum = 0;
    for (const v of h) sum += v;
    if (sum > 0) for (let i = 0; i < h.length; i++) h[i]! /= sum;
    return h;
  }
  const a = await hist(imageA);
  const b = await hist(imageB);
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    acc += d * d;
  }
  return Math.sqrt(acc);
}

export async function runAutomatedStillChecks(input: {
  brief: StillBrief;
  promptSent: string;
  outputPath?: string;
}): Promise<AutomatedStillChecks> {
  const errors: string[] = [];
  const outputPath = input.outputPath;
  const fileExists = Boolean(outputPath && fs.existsSync(outputPath));
  let minWidthOk = false;
  let minHeightOk = false;
  let setHistogramDistance: number | undefined;
  let identityHistogramDistance: number | undefined;

  const harnessOffHonored =
    input.brief.allowPromptPreprocess === true ||
    input.promptSent.trim() === input.brief.prompt.trim() ||
    // allow optional trailing style lock only when caller encoded it in brief
    input.promptSent.trim().startsWith(input.brief.prompt.trim());

  if (!harnessOffHonored) {
    errors.push(
      "Harness-off violated: promptSent diverges from brief.prompt while allowPromptPreprocess is false."
    );
  }

  if (!fileExists) {
    errors.push("Output image missing.");
  } else if (outputPath) {
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(outputPath).metadata();
      minWidthOk = (meta.width ?? 0) >= AUTOMATED_THRESHOLDS.minWidth;
      minHeightOk = (meta.height ?? 0) >= AUTOMATED_THRESHOLDS.minHeight;
      if (!minWidthOk || !minHeightOk) {
        errors.push(
          `Resolution below floor (${AUTOMATED_THRESHOLDS.minWidth}x${AUTOMATED_THRESHOLDS.minHeight}).`
        );
      }

      const setRef = input.brief.refs.find((r) => r.role === "set");
      const idRef = input.brief.refs.find((r) => r.role === "identity");
      if (setRef?.path && fs.existsSync(setRef.path)) {
        setHistogramDistance = await histogramDistance(outputPath, setRef.path);
      }
      if (idRef?.path && fs.existsSync(idRef.path)) {
        identityHistogramDistance = await histogramDistance(
          outputPath,
          idRef.path
        );
      }
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : "Failed to probe output image."
      );
    }
  }

  return {
    fileExists,
    minWidthOk,
    minHeightOk,
    harnessOffHonored,
    setHistogramDistance,
    identityHistogramDistance,
    errors,
  };
}

export type StillEvalFixture = {
  id: string;
  title: string;
  brief: Omit<StillBrief, "projectId"> & { projectId?: string };
  /**
   * Paths relative to the fixture folder for role refs. Eval runner resolves
   * them. Missing files skip histogram gates but still run harness checks.
   */
  refFiles?: Partial<Record<"identity" | "set" | "prop", string>>;
  /** Minimum visual weighted score expected when grading. */
  minVisualWeighted?: number;
};

export function loadFixture(filePath: string): StillEvalFixture {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as StillEvalFixture;
  if (!raw.id || !raw.brief?.prompt) {
    throw new Error(`Invalid still fixture: ${filePath}`);
  }
  return raw;
}

export function listFixtureFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".brief.json"))
    .map((f) => path.join(dir, f))
    .sort();
}
