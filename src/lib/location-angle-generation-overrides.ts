/** Per-angle generation overrides for location references (mirrors shot still negatives). */

export interface LocationAngleGenerationOverrides {
  /** Extra negatives merged into this angle's location reference generation. */
  stillNegativePrompt?: string;
}

export function parseLocationAngleGenerationOverrides(
  json: string | null | undefined
): LocationAngleGenerationOverrides {
  if (!json?.trim()) return {};
  try {
    const parsed = JSON.parse(json) as LocationAngleGenerationOverrides;
    if (!parsed || typeof parsed !== "object") return {};
    const stillNegativePrompt =
      typeof parsed.stillNegativePrompt === "string"
        ? parsed.stillNegativePrompt
        : undefined;
    return {
      ...(stillNegativePrompt?.trim()
        ? { stillNegativePrompt: stillNegativePrompt.trim() }
        : {}),
    };
  } catch {
    return {};
  }
}

export function mergeLocationAngleGenerationOverrides(
  currentJson: string | null | undefined,
  patch: LocationAngleGenerationOverrides
): string | null {
  const current = parseLocationAngleGenerationOverrides(currentJson);
  const next: LocationAngleGenerationOverrides = { ...current };

  if (patch.stillNegativePrompt !== undefined) {
    const trimmed = patch.stillNegativePrompt.trim();
    if (trimmed) next.stillNegativePrompt = trimmed;
    else delete next.stillNegativePrompt;
  }

  if (Object.keys(next).length === 0) return null;
  return JSON.stringify(next);
}
