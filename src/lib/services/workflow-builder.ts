import type { Shot, WorkflowTemplate } from "@/lib/db/schema";
import {
  applyVisualStyleToShotPrompt,
  getVisualStyleNegativeExtras,
  mergeNegativePrompts,
  type VisualStyle,
} from "@/lib/services/visual-style";
import {
  resolveReferenceAspectRatio,
  type ReferenceAspectRatioPreset,
} from "@/lib/services/reference-aspect-ratio";
import type { AnchorReframeIntensity } from "@/lib/ip-adapter-profiles";
import {
  DUAL_IP_ADAPTER_CHARACTER_PROFILE,
  DUAL_IP_ADAPTER_LOCATION_PROFILE,
  DUAL_IP_ADAPTER_VIRTUAL_BACKDROP_CHARACTER_PROFILE,
  DUAL_IP_ADAPTER_VIRTUAL_BACKDROP_LOCATION_PROFILE,
  IP_ADAPTER_REFRAME_PROFILES,
  type IpAdapterProfileSettings,
} from "@/lib/ip-adapter-profiles";
import {
  BindingNodeMismatchError,
  type RenderSettings,
  type WorkflowBindings,
} from "@/types";
import {
  CLIP_VISION_SDXL_FILENAME,
  IP_ADAPTER_SDXL_PLUS_FILENAME,
} from "@/lib/services/comfyui-workflow-requirements";
import { applyFrameCountTransform } from "@/lib/services/frame-count-transform";
import { resolveImageSampler, resolveVideoSampler } from "@/lib/services/image-sampler";

export interface UploadedRefs {
  image?: string;
  video?: string;
  characterImages?: Record<string, string>;
  locationImage?: string;
}

export interface WorkflowPayload {
  workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  clientId: string;
}

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
};

function parseWorkflowJson(raw: string): Record<string, WorkflowNode> {
  const parsed = JSON.parse(raw) as unknown;

  if (parsed && typeof parsed === "object" && "nodes" in parsed) {
    throw new Error(
      "Workflow template must be in ComfyUI API format, not UI export format"
    );
  }

  return parsed as Record<string, WorkflowNode>;
}

function collectBindingNodeIds(bindings: WorkflowBindings): string[] {
  const ids = new Set<string>();

  const add = (id?: string) => {
    if (id) ids.add(id);
  };

  add(bindings.promptNodeId);
  add(bindings.negativePromptNodeId);
  add(bindings.frameCountNodeId);
  add(bindings.referenceImageNodeId);
  add(bindings.secondaryReferenceImageNodeId);
  add(bindings.characterIpAdapterNodeId);
  add(bindings.locationIpAdapterNodeId);
  add(bindings.referenceVideoNodeId);
  add(bindings.seedNodeId);
  bindings.outputNodeIds?.forEach(add);
  add(bindings.fpsNodeId);
  add(bindings.createVideoNodeId);
  add(bindings.conditioningFpsNodeId);
  add(bindings.audioLatentFpsNodeId);
  add(bindings.durationSecondsNodeId);
  add(bindings.outputFilenameNodeId);
  add(bindings.latentVideoNodeId);
  bindings.extraPromptNodes?.forEach((node) => add(node.nodeId));
  bindings.extraSeedNodeIds?.forEach(add);
  bindings.frameCountMirrorNodes?.forEach((node) => add(node.nodeId));
  bindings.controls?.forEach((control) => add(control.nodeId));

  return [...ids];
}

export function validateBindings(
  workflowJson: string,
  bindings: WorkflowBindings
): void {
  const workflow = parseWorkflowJson(workflowJson);
  const requiredNodeIds = collectBindingNodeIds(bindings);
  const missingNodeIds = requiredNodeIds.filter((nodeId) => !workflow[nodeId]);

  if (missingNodeIds.length > 0) {
    throw new BindingNodeMismatchError(missingNodeIds);
  }
}

function setNodeInput(
  workflow: Record<string, WorkflowNode>,
  nodeId: string | undefined,
  inputKey: string | undefined,
  value: unknown
): void {
  if (!nodeId || !inputKey) return;
  const node = workflow[nodeId];
  if (!node) return;
  node.inputs[inputKey] = value;
}

function resolveSeed(
  renderSettings: RenderSettings,
  shotIndexSeed?: number
): number {
  const mode = renderSettings.seedMode ?? "random";
  if (mode === "fixed" && renderSettings.seed != null) {
    return renderSettings.seed;
  }
  if (mode === "increment" && renderSettings.seed != null) {
    return renderSettings.seed + (shotIndexSeed ?? 0);
  }
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

function resolveControlValue(
  controlType: string,
  renderSettings: RenderSettings
): unknown {
  switch (controlType) {
    case "checkpoint":
      return renderSettings.checkpoint;
    case "image_unet":
      return renderSettings.imageUnet;
    case "image_vae":
      return renderSettings.imageVae;
    case "image_text_encoder":
      return renderSettings.imageTextEncoder;
    case "unet":
      return renderSettings.videoUnet;
    case "vae":
      return renderSettings.videoVae;
    case "audio_vae":
      return renderSettings.videoAudioVae;
    case "text_encoder":
      return renderSettings.videoTextEncoder;
    case "video_width":
      return renderSettings.videoWidth;
    case "video_height":
      return renderSettings.videoHeight;
    case "model_device":
    case "vae_device":
      return renderSettings.comfyGpuDevice ?? "default";
    default:
      return undefined;
  }
}

export function buildWorkflowPayload(
  template: WorkflowTemplate,
  bindings: WorkflowBindings,
  renderSettings: RenderSettings,
  shot: Shot,
  uploadedRefs: UploadedRefs,
  options?: {
    clientId?: string;
    shotIndex?: number;
    checkpoint?: string;
    visualStyle?: VisualStyle;
    fps?: number;
    outputFilenamePrefix?: string;
  }
): WorkflowPayload {
  const parsedBindings = JSON.parse(
    template.bindingsJson || "{}"
  ) as WorkflowBindings;
  const mergedBindings: WorkflowBindings = { ...parsedBindings, ...bindings };

  validateBindings(template.workflowJson, mergedBindings);

  const workflow = structuredClone(
    parseWorkflowJson(template.workflowJson)
  ) as Record<string, WorkflowNode>;

  const styledPrompt = options?.visualStyle
    ? applyVisualStyleToShotPrompt(shot.prompt, options.visualStyle)
    : shot.prompt;

  setNodeInput(
    workflow,
    mergedBindings.promptNodeId,
    mergedBindings.promptInputKey ?? "text",
    styledPrompt
  );

  for (const extraPrompt of mergedBindings.extraPromptNodes ?? []) {
    setNodeInput(
      workflow,
      extraPrompt.nodeId,
      extraPrompt.inputKey,
      styledPrompt
    );
  }

  if (mergedBindings.negativePromptNodeId) {
    const overrides = shot.renderOverridesJson
      ? (JSON.parse(shot.renderOverridesJson) as { negativePrompt?: string })
      : {};
    const negativePrompt = mergeNegativePrompts(
      renderSettings.videoDefaultNegative,
      options?.visualStyle
        ? getVisualStyleNegativeExtras(options.visualStyle)
        : undefined,
      overrides.negativePrompt
    );
    if (negativePrompt) {
      setNodeInput(
        workflow,
        mergedBindings.negativePromptNodeId,
        mergedBindings.negativePromptInputKey ?? "text",
        negativePrompt
      );
    }
  }

  const resolvedFrameCount = applyFrameCountTransform(
    shot.durationFrames,
    mergedBindings.frameCountTransform
  );

  setNodeInput(
    workflow,
    mergedBindings.frameCountNodeId,
    mergedBindings.frameCountInputKey ?? "value",
    resolvedFrameCount
  );

  for (const mirror of mergedBindings.frameCountMirrorNodes ?? []) {
    setNodeInput(workflow, mirror.nodeId, mirror.inputKey, resolvedFrameCount);
  }

  const fps = options?.fps ?? shot.fps ?? 24;
  const durationSeconds = Math.max(1, Math.round(shot.durationFrames / fps));

  setNodeInput(
    workflow,
    mergedBindings.fpsNodeId,
    mergedBindings.fpsInputKey ?? "value",
    fps
  );
  setNodeInput(
    workflow,
    mergedBindings.createVideoNodeId,
    mergedBindings.createVideoFpsInputKey ?? "fps",
    fps
  );
  setNodeInput(
    workflow,
    mergedBindings.conditioningFpsNodeId,
    mergedBindings.conditioningFpsInputKey ?? "frame_rate",
    fps
  );
  setNodeInput(
    workflow,
    mergedBindings.audioLatentFpsNodeId,
    mergedBindings.audioLatentFpsInputKey ?? "frame_rate",
    fps
  );
  setNodeInput(
    workflow,
    mergedBindings.durationSecondsNodeId,
    mergedBindings.durationSecondsInputKey ?? "value",
    durationSeconds
  );

  if (renderSettings.videoWidth != null) {
    setNodeInput(
      workflow,
      mergedBindings.latentVideoNodeId,
      mergedBindings.latentVideoWidthInputKey ?? "width",
      renderSettings.videoWidth
    );
  }
  if (renderSettings.videoHeight != null) {
    setNodeInput(
      workflow,
      mergedBindings.latentVideoNodeId,
      mergedBindings.latentVideoHeightInputKey ?? "height",
      renderSettings.videoHeight
    );
  }

  if (options?.outputFilenamePrefix) {
    setNodeInput(
      workflow,
      mergedBindings.outputFilenameNodeId,
      mergedBindings.outputFilenameInputKey ?? "filename_prefix",
      options.outputFilenamePrefix
    );
  }

  const referenceImage =
    uploadedRefs.image ??
    uploadedRefs.locationImage ??
    Object.values(uploadedRefs.characterImages ?? {})[0];

  if (referenceImage) {
    setNodeInput(
      workflow,
      mergedBindings.referenceImageNodeId,
      mergedBindings.referenceImageInputKey ?? "image",
      referenceImage
    );
  }

  if (uploadedRefs.video) {
    setNodeInput(
      workflow,
      mergedBindings.referenceVideoNodeId,
      mergedBindings.referenceVideoInputKey ?? "video",
      uploadedRefs.video
    );
  }

  const resolvedSeed = resolveSeed(renderSettings, options?.shotIndex);

  setNodeInput(
    workflow,
    mergedBindings.seedNodeId,
    mergedBindings.seedInputKey ?? "seed",
    resolvedSeed
  );

  for (const extraSeedNodeId of mergedBindings.extraSeedNodeIds ?? []) {
    setNodeInput(
      workflow,
      extraSeedNodeId,
      mergedBindings.extraSeedInputKey ??
        mergedBindings.seedInputKey ??
        "noise_seed",
      resolvedSeed
    );
  }

  const isVideoWorkflow = mergedBindings.controls?.some(
    (control) => control.type === "unet"
  );
  const checkpoint = isVideoWorkflow
    ? (renderSettings.videoCheckpoint ??
      options?.checkpoint ??
      renderSettings.checkpoint)
    : (options?.checkpoint ?? renderSettings.checkpoint);
  if (mergedBindings.controls) {
    for (const control of mergedBindings.controls) {
      if (control.type === "checkpoint") {
        if (!checkpoint) continue;
        setNodeInput(
          workflow,
          control.nodeId,
          control.nameInputKey ?? "ckpt_name",
          checkpoint
        );
        continue;
      }

      const value = resolveControlValue(control.type, renderSettings);
      if (value == null || value === "") continue;

      if (control.type === "unet" || control.type === "vae" || control.type === "audio_vae") {
        setNodeInput(
          workflow,
          control.nodeId,
          control.nameInputKey ??
            (control.type === "unet" ? "unet_name" : "vae_name"),
          value
        );
      } else if (control.type === "text_encoder") {
        setNodeInput(
          workflow,
          control.nodeId,
          control.nameInputKey ?? control.inputKey ?? "text_encoder",
          value
        );
      } else if (control.type === "video_width" || control.type === "video_height") {
        setNodeInput(
          workflow,
          control.nodeId,
          control.inputKey ?? "value",
          value
        );
      } else if (control.type === "model_device" || control.type === "vae_device") {
        setNodeInput(
          workflow,
          control.nodeId,
          control.inputKey ?? "device",
          value
        );
      }
    }
  }

  if (renderSettings.loras?.length && mergedBindings.controls) {
    for (const lora of renderSettings.loras) {
      const control = mergedBindings.controls.find(
        (item) => item.id === lora.bindingId
      );
      if (!control) continue;

      setNodeInput(
        workflow,
        control.nodeId,
        control.nameInputKey ?? "lora_name",
        lora.name
      );
      setNodeInput(
        workflow,
        control.nodeId,
        control.strengthInputKey ?? "strength_model",
        lora.strength
      );
    }
  }

  if (renderSettings.sampler && mergedBindings.controls) {
    const samplerControls = mergedBindings.controls.filter(
      (control) => control.type === "sampler"
    );
    const videoSampler = resolveVideoSampler(renderSettings);
    for (const samplerControl of samplerControls) {
      if (!samplerControl.inputs) continue;
      for (const [inputKey, valueKey] of Object.entries(samplerControl.inputs)) {
        const value = videoSampler[valueKey as keyof typeof videoSampler];
        if (value != null) {
          setNodeInput(workflow, samplerControl.nodeId, inputKey, value);
        }
      }
    }
  }

  return {
    workflow,
    clientId: options?.clientId ?? crypto.randomUUID(),
  };
}

export interface PortraitPromptInput {
  prompt: string;
  negativePrompt?: string;
  seed: number;
  referenceImage?: string;
  secondaryReferenceImage?: string;
}

export const CHARACTER_SHEET_LATENT_WIDTH = 1536;
export const CHARACTER_SHEET_LATENT_HEIGHT = 768;

function applyReferenceLatentSize(
  workflow: Record<string, WorkflowNode>,
  width: number,
  height: number
): void {
  for (const node of Object.values(workflow)) {
    const inputs = node.inputs;
    if (!("width" in inputs) || !("height" in inputs)) continue;
    inputs.width = width;
    inputs.height = height;
  }
}

function applyIpAdapterModelFiles(
  workflow: Record<string, WorkflowNode>,
  options?: {
    ipadapterFile?: string;
    clipVisionFile?: string;
  }
): void {
  const ipadapterFile =
    options?.ipadapterFile ?? IP_ADAPTER_SDXL_PLUS_FILENAME;
  const clipVisionFile = options?.clipVisionFile ?? CLIP_VISION_SDXL_FILENAME;

  for (const node of Object.values(workflow)) {
    if (node.class_type === "IPAdapterModelLoader") {
      node.inputs.ipadapter_file = ipadapterFile;
    }
    if (node.class_type === "CLIPVisionLoader") {
      node.inputs.clip_name = clipVisionFile;
    }
  }
}

function applyIpAdapterSettings(
  workflow: Record<string, WorkflowNode>,
  profile: IpAdapterProfileSettings
): void {
  for (const node of Object.values(workflow)) {
    if (node.class_type === "IPAdapterAdvanced") {
      node.inputs.weight = profile.weight;
      node.inputs.end_at = profile.endAt;
      node.inputs.weight_type = profile.weightType;
    }
  }
}

function applyIpAdapterSettingsToNode(
  workflow: Record<string, WorkflowNode>,
  nodeId: string | undefined,
  profile: IpAdapterProfileSettings
): void {
  if (!nodeId) return;
  const node = workflow[nodeId];
  if (!node || node.class_type !== "IPAdapterAdvanced") return;
  node.inputs.weight = profile.weight;
  node.inputs.end_at = profile.endAt;
  node.inputs.weight_type = profile.weightType;
}

function applyIpAdapterReframeProfile(
  workflow: Record<string, WorkflowNode>,
  intensity: AnchorReframeIntensity
): void {
  applyIpAdapterSettings(workflow, IP_ADAPTER_REFRAME_PROFILES[intensity]);
}

function isReferenceImageTemplate(purpose: string): boolean {
  return purpose === "character_sheet" || purpose === "location_sheet";
}

export function buildPortraitPayload(
  template: WorkflowTemplate,
  bindings: WorkflowBindings,
  renderSettings: RenderSettings,
  input: PortraitPromptInput,
  options?: {
    clientId?: string;
    checkpoint?: string;
    ipAdapterReframe?: AnchorReframeIntensity;
    ipAdapterOverrides?: Pick<IpAdapterProfileSettings, "weight" | "endAt">;
    dualIpAdapterReframe?: {
      character?: AnchorReframeIntensity;
      location?: AnchorReframeIntensity;
    };
    /** Apply fixed dual IP-Adapter profiles (background pass, then character pass). */
    useDualIpAdapterProfiles?: boolean;
    /** Virtual backdrop: character IP first, location IP last so gray backdrop wins. */
    useDualIpAdapterBackdropProfiles?: boolean;
    detailMacro?: boolean;
    detailMacroWidth?: number;
    detailMacroHeight?: number;
    referenceDimensions?: { width: number; height: number };
    ipAdapterFilenames?: {
      ipadapter?: string;
      clipVision?: string;
    };
  }
): WorkflowPayload {
  const parsedBindings = JSON.parse(
    template.bindingsJson || "{}"
  ) as WorkflowBindings;
  const mergedBindings: WorkflowBindings = { ...parsedBindings, ...bindings };

  validateBindings(template.workflowJson, mergedBindings);

  const workflow = structuredClone(
    parseWorkflowJson(template.workflowJson)
  ) as Record<string, WorkflowNode>;

  setNodeInput(
    workflow,
    mergedBindings.promptNodeId,
    mergedBindings.promptInputKey ?? "text",
    input.prompt
  );

  if (mergedBindings.negativePromptNodeId && input.negativePrompt) {
    setNodeInput(
      workflow,
      mergedBindings.negativePromptNodeId,
      mergedBindings.negativePromptInputKey ?? "text",
      input.negativePrompt
    );
  }

  setNodeInput(
    workflow,
    mergedBindings.seedNodeId,
    mergedBindings.seedInputKey ?? "seed",
    input.seed
  );

  if (input.referenceImage) {
    setNodeInput(
      workflow,
      mergedBindings.referenceImageNodeId,
      mergedBindings.referenceImageInputKey ?? "image",
      input.referenceImage
    );
  }

  if (input.secondaryReferenceImage) {
    setNodeInput(
      workflow,
      mergedBindings.secondaryReferenceImageNodeId,
      mergedBindings.secondaryReferenceImageInputKey ?? "image",
      input.secondaryReferenceImage
    );
  }

  const checkpoint = options?.checkpoint ?? renderSettings.checkpoint;
  if (mergedBindings.controls) {
    for (const control of mergedBindings.controls) {
      if (control.type === "checkpoint") {
        if (!checkpoint) continue;
        setNodeInput(
          workflow,
          control.nodeId,
          control.inputKey ??
            control.nameInputKey ??
            "ckpt_name",
          checkpoint
        );
        continue;
      }

      const value = resolveControlValue(control.type, renderSettings);
      if (value == null || value === "") continue;

      if (
        control.type === "unet" ||
        control.type === "image_unet"
      ) {
        setNodeInput(
          workflow,
          control.nodeId,
          control.nameInputKey ?? "unet_name",
          value
        );
      } else if (
        control.type === "vae" ||
        control.type === "image_vae"
      ) {
        setNodeInput(
          workflow,
          control.nodeId,
          control.nameInputKey ?? "vae_name",
          value
        );
      } else if (
        control.type === "text_encoder" ||
        control.type === "image_text_encoder"
      ) {
        setNodeInput(
          workflow,
          control.nodeId,
          control.nameInputKey ?? control.inputKey ?? "clip_name",
          value
        );
      } else if (control.type === "model_device" || control.type === "vae_device") {
        setNodeInput(
          workflow,
          control.nodeId,
          control.inputKey ?? "device",
          value
        );
      }
    }
  }

  if (renderSettings.loras?.length && mergedBindings.controls) {
    for (const lora of renderSettings.loras) {
      const control = mergedBindings.controls.find(
        (item) => item.id === lora.bindingId
      );
      if (!control) continue;
      setNodeInput(
        workflow,
        control.nodeId,
        control.nameInputKey ?? "lora_name",
        lora.name
      );
      setNodeInput(
        workflow,
        control.nodeId,
        control.strengthInputKey ?? "strength_model",
        lora.strength
      );
    }
  }

  if (renderSettings.sampler && mergedBindings.controls) {
    const samplerControl = mergedBindings.controls.find(
      (control) => control.type === "sampler"
    );
    if (samplerControl?.inputs) {
      const imageSampler = resolveImageSampler(renderSettings);
      for (const [inputKey, valueKey] of Object.entries(samplerControl.inputs)) {
        const value = imageSampler[valueKey as keyof typeof imageSampler];
        if (value != null) {
          setNodeInput(workflow, samplerControl.nodeId, inputKey, value);
        }
      }
    }
  }

  // buildPortraitPayload is only used for character/location reference batches.
  const referenceUsage = mergedBindings.referenceImageUsage ?? "img2img";
  const needsFreshLatent =
    !input.referenceImage || referenceUsage === "ipadapter";

  if (needsFreshLatent) {
    const ratio = options?.referenceDimensions
      ? options.referenceDimensions
      : options?.detailMacro
        ? {
            width: options.detailMacroWidth ?? 896,
            height: options.detailMacroHeight ?? 896,
          }
        : resolveReferenceAspectRatio(
            renderSettings.referenceAspectRatio as ReferenceAspectRatioPreset | undefined
          );
    applyReferenceLatentSize(workflow, ratio.width, ratio.height);
  }

  if (
    referenceUsage === "ipadapter" &&
    input.referenceImage &&
    input.secondaryReferenceImage &&
    options?.useDualIpAdapterBackdropProfiles
  ) {
    applyIpAdapterModelFiles(workflow, {
      ipadapterFile: options.ipAdapterFilenames?.ipadapter,
      clipVisionFile: options.ipAdapterFilenames?.clipVision,
    });
    const charLoadId = mergedBindings.referenceImageNodeId;
    const locLoadId = mergedBindings.secondaryReferenceImageNodeId;
    const firstIpId = mergedBindings.locationIpAdapterNodeId;
    const lastIpId = mergedBindings.characterIpAdapterNodeId;
    if (charLoadId && locLoadId && firstIpId && lastIpId) {
      setNodeInput(workflow, firstIpId, "image", [charLoadId, 0]);
      setNodeInput(workflow, lastIpId, "image", [locLoadId, 0]);
      applyIpAdapterSettingsToNode(
        workflow,
        firstIpId,
        DUAL_IP_ADAPTER_VIRTUAL_BACKDROP_CHARACTER_PROFILE
      );
      applyIpAdapterSettingsToNode(
        workflow,
        lastIpId,
        DUAL_IP_ADAPTER_VIRTUAL_BACKDROP_LOCATION_PROFILE
      );
    }
  } else if (
    referenceUsage === "ipadapter" &&
    input.referenceImage &&
    input.secondaryReferenceImage &&
    options?.useDualIpAdapterProfiles
  ) {
    applyIpAdapterModelFiles(workflow, {
      ipadapterFile: options.ipAdapterFilenames?.ipadapter,
      clipVisionFile: options.ipAdapterFilenames?.clipVision,
    });
    applyIpAdapterSettingsToNode(
      workflow,
      mergedBindings.locationIpAdapterNodeId,
      DUAL_IP_ADAPTER_LOCATION_PROFILE
    );
    applyIpAdapterSettingsToNode(
      workflow,
      mergedBindings.characterIpAdapterNodeId,
      DUAL_IP_ADAPTER_CHARACTER_PROFILE
    );
  } else if (
    referenceUsage === "ipadapter" &&
    input.referenceImage &&
    input.secondaryReferenceImage &&
    options?.dualIpAdapterReframe
  ) {
    applyIpAdapterModelFiles(workflow, {
      ipadapterFile: options.ipAdapterFilenames?.ipadapter,
      clipVisionFile: options.ipAdapterFilenames?.clipVision,
    });
    if (options.dualIpAdapterReframe.character) {
      applyIpAdapterSettingsToNode(
        workflow,
        mergedBindings.characterIpAdapterNodeId,
        IP_ADAPTER_REFRAME_PROFILES[options.dualIpAdapterReframe.character]
      );
    }
    if (options.dualIpAdapterReframe.location) {
      applyIpAdapterSettingsToNode(
        workflow,
        mergedBindings.locationIpAdapterNodeId,
        IP_ADAPTER_REFRAME_PROFILES[options.dualIpAdapterReframe.location]
      );
    }
  } else if (
    referenceUsage === "ipadapter" &&
    input.referenceImage &&
    options?.ipAdapterOverrides
  ) {
    applyIpAdapterModelFiles(workflow, {
      ipadapterFile: options.ipAdapterFilenames?.ipadapter,
      clipVisionFile: options.ipAdapterFilenames?.clipVision,
    });
    applyIpAdapterSettings(workflow, {
      ...IP_ADAPTER_REFRAME_PROFILES.extreme,
      ...options.ipAdapterOverrides,
    });
  } else if (
    referenceUsage === "ipadapter" &&
    input.referenceImage &&
    options?.ipAdapterReframe
  ) {
    applyIpAdapterModelFiles(workflow, {
      ipadapterFile: options.ipAdapterFilenames?.ipadapter,
      clipVisionFile: options.ipAdapterFilenames?.clipVision,
    });
    applyIpAdapterReframeProfile(workflow, options.ipAdapterReframe);
  } else if (referenceUsage === "ipadapter" && input.referenceImage) {
    applyIpAdapterModelFiles(workflow, {
      ipadapterFile: options?.ipAdapterFilenames?.ipadapter,
      clipVisionFile: options?.ipAdapterFilenames?.clipVision,
    });
  }

  return {
    workflow,
    clientId: options?.clientId ?? crypto.randomUUID(),
  };
}
