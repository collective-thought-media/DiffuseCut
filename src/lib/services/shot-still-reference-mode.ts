import type { LocationReferenceGenerationOptions } from "@/types";
import {
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";
import {
  DEFAULT_COMPOSITE_BACKGROUND_BLUR,
  DEFAULT_COMPOSITE_BACKGROUND_SIGMA,
  DEFAULT_COMPOSITE_CHARACTER_HEIGHT,
  DEFAULT_COMPOSITE_CHARACTER_WIDTH,
  DEFAULT_COMPOSITE_CHARACTER_X,
  DEFAULT_COMPOSITE_CHARACTER_Y,
  DEFAULT_COMPOSITE_INPAINT_DENOISE,
  DEFAULT_COMPOSITE_MASK_BLUR,
  DEFAULT_COMPOSITE_COLOR_MATCH_FACTOR,
  DEFAULT_INTEGRATE_INPAINT_DENOISE,
  DEFAULT_INTEGRATE_SUBJECT_ANCHOR_X,
  DEFAULT_INTEGRATE_SUBJECT_HEIGHT_FRACTION,
  DEFAULT_LOCATION_PLATE_DENOISE,
} from "@/lib/compositing-defaults";
import { INTEGRATE_IN_SCENE_CHARACTER_PROFILE } from "@/lib/ip-adapter-profiles";

export type ShotStillReferenceMode =
  | "auto"
  | "scene_edit"
  | "integrate_in_scene"
  | "dual"
  | "composited"
  | "character"
  | "location"
  | "prompt_only";

export type ShotStillReferenceEffectiveMode =
  | "scene_edit"
  | "integrate_in_scene"
  | "dual"
  | "composited"
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
  useCompositingPipeline: boolean;
  referenceFocus: "character" | "location";
  primaryPath: string | null;
  characterPath: string | null;
  locationPath: string | null;
  hasLocationReferenceForPrompt: boolean;
  includeDualLayoutSuffix: boolean;
  label: string | null;
  workflowTemplateId:
    | typeof BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID
    | typeof BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID
    | typeof BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID
    | typeof BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID
    | typeof BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID
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

  if (mode === "scene_edit") {
    if (hasCharacter && hasLocation) return "scene_edit";
    if (hasCharacter) return "character";
    if (hasLocation) return "location";
    return "none";
  }

  if (mode === "integrate_in_scene") {
    if (hasCharacter && hasLocation) return "integrate_in_scene";
    if (hasCharacter) return "character";
    if (hasLocation) return "location";
    return "none";
  }

  if (mode === "composited") {
    if (hasCharacter && hasLocation) return "composited";
    if (hasCharacter) return "character";
    if (hasLocation) return "location";
    return "none";
  }

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

  if (hasCharacter && hasLocation) return "integrate_in_scene";
  if (hasCharacter) return "character";
  if (hasLocation) return "location";
  return "none";
}

export function resolveShotStillReferencePlan(
  refs: ShotStillReferenceInputs,
  mode: ShotStillReferenceMode = "auto",
  options?: {
    virtualBackdrop?: boolean;
    compositingPipelineAvailable?: boolean;
  }
): ShotStillReferencePlan {
  const effectiveMode = resolveShotStillReferenceEffectiveMode(refs, mode);
  const useDualIpAdapter = effectiveMode === "dual";
  const useCompositingPipeline =
    effectiveMode === "composited" &&
    options?.compositingPipelineAvailable === true;
  const useIntegrateInScene = effectiveMode === "integrate_in_scene";
  const useSceneEdit = effectiveMode === "scene_edit";
  const useIpAdapter =
    effectiveMode === "dual" ||
    effectiveMode === "composited" ||
    useIntegrateInScene ||
    effectiveMode === "character" ||
    effectiveMode === "location";

  const characterPath =
    useDualIpAdapter ||
    effectiveMode === "composited" ||
    useIntegrateInScene ||
    useSceneEdit ||
    effectiveMode === "character"
      ? refs.characterPath
      : null;
  const locationPath =
    useDualIpAdapter ||
    effectiveMode === "composited" ||
    useIntegrateInScene ||
    useSceneEdit ||
    effectiveMode === "location"
      ? refs.locationPath
      : null;

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
  } else if (useSceneEdit) {
    label = `${refs.characterName ?? "Character"} in ${locationLabel(refs) ?? "location"} (scene edit)`;
  } else if (useIntegrateInScene) {
    label = `${refs.characterName ?? "Character"} in ${locationLabel(refs) ?? "location"} (integrate in scene)`;
  } else if (effectiveMode === "composited") {
    label = `${refs.characterName ?? "Character"} on ${locationLabel(refs) ?? "location"} (composited)`;
  } else if (effectiveMode === "character") {
    label = refs.characterName ?? "Character";
  } else if (effectiveMode === "location") {
    label = locationLabel(refs);
  }

  let workflowTemplateId: ShotStillReferencePlan["workflowTemplateId"] = null;
  if (useDualIpAdapter) {
    workflowTemplateId = BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID;
  } else if (useSceneEdit) {
    workflowTemplateId = BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID;
  } else if (useIntegrateInScene) {
    workflowTemplateId = BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID;
  } else if (effectiveMode === "composited") {
    workflowTemplateId = useCompositingPipeline
      ? BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID
      : BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID;
  } else if (useIpAdapter && primaryPath) {
    workflowTemplateId = BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID;
  }

  const generationOptions: LocationReferenceGenerationOptions = {
    stillReferenceMode: mode,
    referenceFocus,
    useIpAdapter,
    // Integrate in scene: style-transfer IP-Adapter at the morning-tuned
    // defaults. The graph still RemBG-pastes onto the plate and runs the
    // harmonization pass so edges and lighting match the set.
    ipAdapterWeight: useIntegrateInScene
      ? INTEGRATE_IN_SCENE_CHARACTER_PROFILE.weight
      : undefined,
    ipAdapterEndAt: useIntegrateInScene
      ? INTEGRATE_IN_SCENE_CHARACTER_PROFILE.endAt
      : undefined,
    ipAdapterWeightType: useIntegrateInScene
      ? INTEGRATE_IN_SCENE_CHARACTER_PROFILE.weightType
      : undefined,
    virtualBackdrop:
      useDualIpAdapter && options?.virtualBackdrop === true ? true : undefined,
    useCompositingPipeline: useCompositingPipeline || undefined,
    // Integrate in scene denoises only inside the subject mask, so it takes a
    // higher value than the full-frame composited plate pass.
    locationPlateDenoise: useIntegrateInScene
      ? DEFAULT_INTEGRATE_INPAINT_DENOISE
      : effectiveMode === "composited"
        ? DEFAULT_LOCATION_PLATE_DENOISE
        : undefined,
    integrateSubjectHeightFraction: useIntegrateInScene
      ? DEFAULT_INTEGRATE_SUBJECT_HEIGHT_FRACTION
      : undefined,
    integrateSubjectAnchorX: useIntegrateInScene
      ? DEFAULT_INTEGRATE_SUBJECT_ANCHOR_X
      : undefined,
    compositeInpaintDenoise: useCompositingPipeline
      ? DEFAULT_COMPOSITE_INPAINT_DENOISE
      : undefined,
    compositeBackgroundBlurRadius: useCompositingPipeline
      ? DEFAULT_COMPOSITE_BACKGROUND_BLUR
      : undefined,
    compositeBackgroundBlurSigma: useCompositingPipeline
      ? DEFAULT_COMPOSITE_BACKGROUND_SIGMA
      : undefined,
    compositeCharacterWidth: useCompositingPipeline
      ? DEFAULT_COMPOSITE_CHARACTER_WIDTH
      : undefined,
    compositeCharacterHeight: useCompositingPipeline
      ? DEFAULT_COMPOSITE_CHARACTER_HEIGHT
      : undefined,
    compositeCharacterX: useCompositingPipeline
      ? DEFAULT_COMPOSITE_CHARACTER_X
      : undefined,
    compositeCharacterY: useCompositingPipeline
      ? DEFAULT_COMPOSITE_CHARACTER_Y
      : undefined,
    compositeMaskBlurAmount: useCompositingPipeline
      ? DEFAULT_COMPOSITE_MASK_BLUR
      : undefined,
    compositeColorMatchFactor: useCompositingPipeline
      ? DEFAULT_COMPOSITE_COLOR_MATCH_FACTOR
      : undefined,
  };

  return {
    requestedMode: mode,
    effectiveMode,
    useIpAdapter,
    useDualIpAdapter,
    useCompositingPipeline,
    referenceFocus,
    primaryPath,
    characterPath,
    locationPath,
    hasLocationReferenceForPrompt:
      useDualIpAdapter ||
      useIntegrateInScene ||
      useSceneEdit ||
      effectiveMode === "composited" ||
      effectiveMode === "location",
    includeDualLayoutSuffix: useDualIpAdapter,
    label,
    workflowTemplateId,
    generationOptions,
  };
}

export function listAvailableShotStillReferenceModes(
  refs: ShotStillReferenceInputs
): ShotStillReferenceMode[] {
  const hasCharacter = Boolean(refs.characterPath);
  const hasLocation = Boolean(refs.locationPath);
  const modes: ShotStillReferenceMode[] = ["auto", "prompt_only"];

  if (hasCharacter && hasLocation) {
    modes.push("scene_edit", "integrate_in_scene", "composited", "dual");
  }
  if (hasCharacter) modes.push("character");
  if (hasLocation) modes.push("location");

  return modes;
}
