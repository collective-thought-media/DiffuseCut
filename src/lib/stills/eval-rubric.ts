/**
 * Self-eval rubrics for Still Director providers.
 *
 * Automated checks run without GPUs. Human / agent visual grades fill the
 * subjective dimensions. A provider "passes Sand Storm bar" only when both
 * automated gates and visual grades clear thresholds.
 */

export type RubricDimensionId =
  | "identity_lock"
  | "set_continuity"
  | "prop_readability"
  | "camera_intent"
  | "photoreal_grade"
  | "no_harness_artifacts"
  | "seed_ready_for_i2v";

export type RubricDimension = {
  id: RubricDimensionId;
  label: string;
  weight: number;
  /** What a 5 looks like. */
  passDescription: string;
};

export const STILL_RUBRIC: RubricDimension[] = [
  {
    id: "identity_lock",
    label: "Identity lock",
    weight: 1.2,
    passDescription:
      "Same character silhouette, wardrobe, and signature gear as the identity ref. No wardrobe drift, no face swap, no studio backdrop leak from the casting sheet.",
  },
  {
    id: "set_continuity",
    label: "Set continuity",
    weight: 1.2,
    passDescription:
      "Same world as the set ref: materials, palette, sand/grade, wreckage language. Not a new desert invented from the prompt alone.",
  },
  {
    id: "prop_readability",
    label: "Prop readability",
    weight: 0.8,
    passDescription:
      "If a prop ref is attached, the prop is recognizable (materials and shape), not a generic stand-in.",
  },
  {
    id: "camera_intent",
    label: "Camera intent",
    weight: 1.0,
    passDescription:
      "Framing matches the brief (wide / walk-up / POV / insert). Not an accidental punch-in of the wrong axis.",
  },
  {
    id: "photoreal_grade",
    label: "Photoreal grade",
    weight: 0.8,
    passDescription:
      "Film still, not plastic CGI, not half-denoised latent noise, not sticker composite.",
  },
  {
    id: "no_harness_artifacts",
    label: "No harness artifacts",
    weight: 1.0,
    passDescription:
      "No RemBG holes, translucent limbs, double exposure, studio wall from sheet, or prompt-soup contradictions.",
  },
  {
    id: "seed_ready_for_i2v",
    label: "Seed ready for I2V",
    weight: 1.0,
    passDescription:
      "You would approve this still as the LTX / MiniMax seed without regenerating.",
  },
];

export type DimensionScore = {
  id: RubricDimensionId;
  score: number; // 1..5
  notes?: string;
};

export type VisualGrade = {
  optionId: string;
  providerId: string;
  fixtureId: string;
  scores: DimensionScore[];
  gradedBy: string;
  gradedAt: string;
};

export type AutomatedStillChecks = {
  fileExists: boolean;
  minWidthOk: boolean;
  minHeightOk: boolean;
  /** Prompt sent must equal brief.prompt when allowPromptPreprocess is false. */
  harnessOffHonored: boolean;
  /** Histogram distance to set ref when present (0 = identical, higher = drift). */
  setHistogramDistance?: number;
  /** Histogram distance to identity ref when present. */
  identityHistogramDistance?: number;
  errors: string[];
};

export type StillEvalCaseResult = {
  fixtureId: string;
  providerId: string;
  optionId?: string;
  automated: AutomatedStillChecks;
  visual?: VisualGrade;
  weightedScore?: number;
  pass: boolean;
};

export const AUTOMATED_THRESHOLDS = {
  minWidth: 1024,
  minHeight: 576,
  /** Soft gate; histogram is a cheap proxy, not identity proof. */
  maxSetHistogramDistance: 0.55,
  maxIdentityHistogramDistance: 0.65,
  minVisualWeighted: 3.6,
};

export function weightedRubricScore(scores: DimensionScore[]): number {
  let num = 0;
  let den = 0;
  for (const dim of STILL_RUBRIC) {
    const hit = scores.find((s) => s.id === dim.id);
    if (!hit) continue;
    num += hit.score * dim.weight;
    den += dim.weight;
  }
  return den === 0 ? 0 : num / den;
}

export function automatedPass(checks: AutomatedStillChecks): boolean {
  if (checks.errors.length) return false;
  if (!checks.fileExists || !checks.minWidthOk || !checks.minHeightOk) {
    return false;
  }
  if (!checks.harnessOffHonored) return false;
  if (
    checks.setHistogramDistance != null &&
    checks.setHistogramDistance > AUTOMATED_THRESHOLDS.maxSetHistogramDistance
  ) {
    return false;
  }
  if (
    checks.identityHistogramDistance != null &&
    checks.identityHistogramDistance >
      AUTOMATED_THRESHOLDS.maxIdentityHistogramDistance
  ) {
    return false;
  }
  return true;
}

export function casePass(
  automated: AutomatedStillChecks,
  visual?: VisualGrade
): { pass: boolean; weightedScore?: number } {
  if (!automatedPass(automated)) return { pass: false };
  if (!visual) return { pass: false };
  const weightedScore = weightedRubricScore(visual.scores);
  return {
    pass: weightedScore >= AUTOMATED_THRESHOLDS.minVisualWeighted,
    weightedScore,
  };
}
