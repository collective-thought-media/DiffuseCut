import type { LocationReferenceGenerationOptions } from "@/types";
import {
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

export type ShotStillReferenceMode =
  | "auto"
  | "dual"
  | "character"
  | "location"
  | "prompt_only";

export type ShotStillReferenceEffectiveMode =
  | "dual"
  | "character"
  | "location"
  | "prompt_only"
  | "none";

export type ShotStillReferenceInputs = {
  characterPath: string | null;
  locationPath: string | null;
  characterName?: string | null;
  locationStateName?: string | null;
  locationAngleName?: string | null;
};

export type ShotStillReferencePlan = {
  requestedMode: ShotStillReferenceMode;
  effectiveMode: ShotStillReferenceEffectiveMode;
  useIpAdapter: boolean;
  useDualIpAdapter: boolean;
  referenceFocus: "character" | "location";
  primaryPath: string | null;
  characterPath: string | null;
  locationPath: string | null;
  hasLocationReferenceForPrompt: boolean;
  includeDualLayoutSuffix: boolean;
  label: string | null;
  workflowTemplateId:
    | typeof BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID
    | typeof BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID
    | null;
  generationOptions: LocationReferenceGenerationOptions;
};

function locationLabel(input: ShotStillReferenceInputs): string | null {
  const parts = [input.locationStateName, input.locationAngleName].filter(
    Boolean
  );
  return parts.length > 0 ? parts.join(", ") : "location";
}

export function resolveShotStillReferenceEffectiveMode(
  refs: ShotStillReferenceInputs,
  mode: ShotStillReferenceMode = "auto"
): ShotStillReferenceEffectiveMode {
  const hasCharacter = Boolean(refs.characterPath);
  const hasLocation = Boolean(refs.locationPath);

  if (mode === "prompt_only") return "prompt_only";

  if (mode === "dual") {
    if (hasCharacter && hasLocation) return "dual";
    if (hasCharacter) return "character";
    if (hasLocation) return "location";
    return "none";
  }

  if (mode === "character") {
    if (hasCharacter) return "character";
    if (hasLocation) return "location";
    return "none";
  }

  if (mode === "location") {
    if (hasLocation) return "location";
    if (hasCharacter) return "character";
    return "none";
  }

  if (hasCharacter && hasLocation) return "dual";
  if (hasCharacter) return "character";
  if (hasLocation) return "location";
  return "none";
}

export function resolveShotStillReferencePlan(
  refs: ShotStillReferenceInputs,
  mode: ShotStillReferenceMode = "auto",
  options?: { virtualBackdrop?: boolean }
): ShotStillReferencePlan {
  const effectiveMode = resolveShotStillReferenceEffectiveMode(refs, mode);
  const useDualIpAdapter = effectiveMode === "dual";
  const useIpAdapter =
    effectiveMode === "dual" ||
    effectiveMode === "character" ||
    effectiveMode === "location";

  const characterPath =
    useDualIpAdapter || effectiveMode === "character"
      ? refs.characterPath
      : null;
  const locationPath =
    useDualIpAdapter || effectiveMode === "location" ? refs.locationPath : null;

  const referenceFocus: "character" | "location" =
    effectiveMode === "character" ? "character" : "location";

  const primaryPath =
    effectiveMode === "character"
      ? refs.characterPath
      : effectiveMode === "location"
        ? refs.locationPath
        : null;

  let label: string | null = null;
  if (useDualIpAdapter) {
    label = `${refs.characterName ?? "Character"} + ${locationLabel(refs) ?? "location"}`;
  } else if (effectiveMode === "character") {
    label = refs.characterName ?? "Character";
  } else if (effectiveMode === "location") {
    label = locationLabel(refs);
  }

  const workflowTemplateId = useDualIpAdapter
    ? BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID
    : useIpAdapter && primaryPath
      ? BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID
      : null;

  const generationOptions: LocationReferenceGenerationOptions = {
    stillReferenceMode: mode,
    referenceFocus,
    useIpAdapter,
    virtualBackdrop:
      useDualIpAdapter && options?.virtualBackdrop === true ? true : undefined,
  };

  return {
    requestedMode: mode,
    effectiveMode,
    useIpAdapter,
    useDualIpAdapter,
    referenceFocus,
    primaryPath,
    characterPath,
    locationPath,
    hasLocationReferenceForPrompt:
      useDualIpAdapter || effectiveMode === "location",
    includeDualLayoutSuffix: useDualIpAdapter,
    label,
    workflowTemplateId,
    generationOptions,
  };
}

export function listAvailableShotStillReferenceModes(
  refs: ShotStillReferenceInputs
): ShotStillReferenceMode[] {
  const modes: ShotStillReferenceMode[] = ["auto", "prompt_only"];
  const hasCharacter = Boolean(refs.characterPath);
  const hasLocation = Boolean(refs.locationPath);

  if (hasCharacter) modes.push("character");
  if (hasLocation) modes.push("location");
  if (hasCharacter && hasLocation) modes.push("dual");

  return modes;
}
