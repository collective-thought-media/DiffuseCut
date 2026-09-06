import type { ShotStillReferenceMode } from "@/lib/services/shot-still-reference-mode";

/** How strongly the character reference locks identity in shot stills. */
export type ShotIdentityStrength = "low" | "balanced" | "high";

/** How the shot's rendered audio track is treated at export time. */
export type ShotAudioPolicy = "keep" | "mute";

/**
 * Resolve the effective audio policy for a shot. When no explicit policy is
 * set (Auto), the shot's rendered audio is kept only while the project has no
 * finishing audio tracks; once a score, dialog, or SFX track exists, the
 * model-invented clip audio is muted so it never mixes under the soundtrack.
 */
export function resolveShotAudioPolicy(
  policy: ShotAudioPolicy | undefined,
  hasTimelineAudioTracks: boolean
): ShotAudioPolicy {
  if (policy === "keep" || policy === "mute") return policy;
  return hasTimelineAudioTracks ? "mute" : "keep";
}

/** Subject size in frame for Integrate in scene (drives the inpaint mask). */
export type ShotSubjectScale = "small" | "medium" | "large";

/** Horizontal placement of the subject for Integrate in scene. */
export type ShotSubjectPosition = "left" | "center" | "right";

/** Post pass that repaints the character's face at higher detail. */
export type ShotFaceDetail = "refine" | "off";

export const SHOT_IDENTITY_STRENGTH_VALUES: ShotIdentityStrength[] = [
  "low",
  "balanced",
  "high",
];

export const SHOT_SUBJECT_SCALE_VALUES: ShotSubjectScale[] = [
  "small",
  "medium",
  "large",
];

export const SHOT_SUBJECT_POSITION_VALUES: ShotSubjectPosition[] = [
  "left",
  "center",
  "right",
];

/** Mask height as a fraction of frame height per subject scale preset.
 * Tuned so Medium reads as door/window scale on establishing plates.
 * Large is for closer indoor / foreground hero framing. */
export const SHOT_SUBJECT_SCALE_FRACTIONS: Record<ShotSubjectScale, number> = {
  small: 0.28,
  medium: 0.38,
  large: 0.55,
};

/** Mask horizontal center as a fraction of frame width per position preset. */
export const SHOT_SUBJECT_POSITION_ANCHORS: Record<ShotSubjectPosition, number> =
  {
    left: 0.3,
    center: 0.5,
    right: 0.7,
  };

export interface ShotRenderOverrides {
  /** Extra negatives for video render workflow. */
  negativePrompt?: string;
  /** Extra negatives merged into storyboard still generation for this shot. */
  stillNegativePrompt?: string;
  /** Which visual reference to send for storyboard still generation. */
  stillReferenceMode?: ShotStillReferenceMode;
  /** Character reference influence on shot stills (default balanced). */
  identityStrength?: ShotIdentityStrength;
  /** Integrate in scene: how large the subject renders in frame. */
  subjectScale?: ShotSubjectScale;
  /** Integrate in scene: where the subject sits horizontally. */
  subjectPosition?: ShotSubjectPosition;
  /**
   * Keep or mute this shot's rendered audio in the export. Unset means Auto:
   * keep when the project has no finishing audio tracks, mute once any score,
   * dialog, or SFX track exists.
   */
  audioPolicy?: ShotAudioPolicy;
  /** Face detail pass after still generation (default off). */
  faceDetail?: ShotFaceDetail;
}

const ENUM_OVERRIDE_KEYS = [
  "stillReferenceMode",
  "identityStrength",
  "subjectScale",
  "subjectPosition",
  "audioPolicy",
  "faceDetail",
] as const;

type EnumOverrideKey = (typeof ENUM_OVERRIDE_KEYS)[number];

function isEnumOverrideKey(key: keyof ShotRenderOverrides): key is EnumOverrideKey {
  return (ENUM_OVERRIDE_KEYS as readonly string[]).includes(key);
}
export function parseShotRenderOverrides(
  json: string | null | undefined
): ShotRenderOverrides {
  if (!json?.trim()) return {};
  try {
    return JSON.parse(json) as ShotRenderOverrides;
  } catch {
    return {};
  }
}

export function mergeShotRenderOverrides(
  existing: ShotRenderOverrides,
  patch: Partial<ShotRenderOverrides>
): ShotRenderOverrides {
  const next: ShotRenderOverrides = { ...existing };
  for (const [key, value] of Object.entries(patch) as Array<
    [keyof ShotRenderOverrides, string | undefined]
  >) {
    if (value === undefined) continue;
    if (isEnumOverrideKey(key)) {
      if (!value) {
        delete next[key];
      } else {
        (next as Record<EnumOverrideKey, string>)[key] = value;
      }
      continue;
    }
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      delete next[key];
    } else {
      next[key] = trimmed;
    }
  }
  return next;
}
export function serializeShotRenderOverrides(
  overrides: ShotRenderOverrides
): string | null {
  const cleaned: ShotRenderOverrides = {};
  for (const [key, value] of Object.entries(overrides) as Array<
    [keyof ShotRenderOverrides, string | undefined]
  >) {
    if (isEnumOverrideKey(key)) {
      if (value) (cleaned as Record<EnumOverrideKey, string>)[key] = value;
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      cleaned[key] = value.trim();
    }
  }
  return Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
}