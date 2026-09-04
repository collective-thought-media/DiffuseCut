import type { ShotStillReferenceMode } from "@/lib/services/shot-still-reference-mode";

export interface ShotRenderOverrides {
  /** Extra negatives for video render workflow. */
  negativePrompt?: string;
  /** Extra negatives merged into storyboard still generation for this shot. */
  stillNegativePrompt?: string;
  /** Which visual reference to send for storyboard still generation. */
  stillReferenceMode?: ShotStillReferenceMode;
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
    [keyof ShotRenderOverrides, string | ShotStillReferenceMode | undefined]
  >) {
    if (value === undefined) continue;
    if (key === "stillReferenceMode") {
      if (!value) {
        delete next.stillReferenceMode;
      } else {
        next.stillReferenceMode = value as ShotStillReferenceMode;
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
    [keyof ShotRenderOverrides, string | ShotStillReferenceMode | undefined]
  >) {
    if (key === "stillReferenceMode") {
      if (value) cleaned.stillReferenceMode = value as ShotStillReferenceMode;
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      cleaned[key] = value.trim();
    }
  }
  return Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
}