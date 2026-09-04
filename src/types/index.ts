export type DependencyId =
  | "node"
  | "npm_deps"
  | "app_data_dir"
  | "ffmpeg"
  | "comfyui"
  | "comfyui_checkpoints"
  | "comfyui_ipadapter"
  | "comfyui_ltx_i2v"
  | "comfyui_minimax_i2v"
  | "comfyui_ace_step"
  | "score_audio";

export type DependencyRequiredFor = "app" | "export" | "render" | "finishing";

export type DependencyStatusValue = "ok" | "missing" | "warning" | "info" | "unknown";

export interface DependencyStatus {
  id: DependencyId;
  label: string;
  status: DependencyStatusValue;
  requiredFor: DependencyRequiredFor[];
  /** When true, not having this stack installed is normal (shown as optional, not a warning). */
  optional?: boolean;
  message: string;
  installHint: string;
  docsUrl?: string;
  detectedVersion?: string;
  lastCheckedAt: number;
}

export interface WorkflowBindings {
  promptNodeId?: string;
  promptInputKey?: string;
  /** Additional prompt fields (e.g. LTX TextGenerateLTX2Prompt). */
  extraPromptNodes?: Array<{ nodeId: string; inputKey: string }>;
  negativePromptNodeId?: string;
  negativePromptInputKey?: string;
  frameCountNodeId?: string;
  frameCountInputKey?: string;
  /** Model-specific frame count rules before injecting into the workflow. */
  frameCountTransform?: "none" | "ltx_8n1" | "minimax_17k5";
  /** Copy the resolved frame count to additional nodes (e.g. LTX audio latent). */
  frameCountMirrorNodes?: Array<{ nodeId: string; inputKey: string }>;
  referenceImageNodeId?: string;
  referenceImageInputKey?: string;
  /** img2img encodes the reference into the latent; ipadapter keeps txt2img composition freedom. */
  referenceImageUsage?: "img2img" | "ipadapter";
  referenceVideoNodeId?: string;
  referenceVideoInputKey?: string;
  seedNodeId?: string;
  seedInputKey?: string;
  /** Additional seed nodes that receive the same seed (e.g. duplicate RandomNoise). */
  extraSeedNodeIds?: string[];
  extraSeedInputKey?: string;
  fpsNodeId?: string;
  fpsInputKey?: string;
  createVideoNodeId?: string;
  createVideoFpsInputKey?: string;
  conditioningFpsNodeId?: string;
  conditioningFpsInputKey?: string;
  audioLatentFpsNodeId?: string;
  audioLatentFpsInputKey?: string;
  durationSecondsNodeId?: string;
  durationSecondsInputKey?: string;
  outputFilenameNodeId?: string;
  outputFilenameInputKey?: string;
  latentVideoNodeId?: string;
  latentVideoWidthInputKey?: string;
  latentVideoHeightInputKey?: string;
  outputNodeIds?: string[];
  controls?: WorkflowControl[];
}

export interface WorkflowControl {
  id: string;
  label: string;
  type: string;
  nodeId: string;
  inputKey?: string;
  nameInputKey?: string;
  strengthInputKey?: string;
  optional?: boolean;
  inputs?: Record<string, string>;
}

import type { ReferenceAspectRatioPreset } from "@/lib/services/reference-aspect-ratio";

export interface RenderSettings {
  workflowTemplateId?: string;
  characterSheetTemplateId?: string;
  locationSheetTemplateId?: string;
  /** Aspect ratio for character sheet and location reference generation. */
  referenceAspectRatio?: ReferenceAspectRatioPreset;
  checkpoint?: string;
  /** LTX / video workflow checkpoint (separate from SDXL character sheet checkpoint). */
  videoCheckpoint?: string;
  loras?: { bindingId: string; name: string; strength: number }[];
  /** SDXL still-image sampling (storyboard frames, character/location references). */
  imageSampler?: {
    steps?: number;
    cfg?: number;
    sampler_name?: string;
    scheduler?: string;
  };
  /** Video workflow sampling (LTX shot renders). */
  sampler?: {
    steps?: number;
    cfg?: number;
    sampler_name?: string;
    scheduler?: string;
  };
  seedMode?: "random" | "fixed" | "increment";
  seed?: number;
  /** Video render workflow overrides (bound via template controls). */
  videoUnet?: string;
  videoVae?: string;
  /** MiniMax H3 and other AV workflows with a separate audio VAE loader. */
  videoAudioVae?: string;
  videoTextEncoder?: string;
  videoWidth?: number;
  videoHeight?: number;
  videoDefaultNegative?: string;
  /** ComfyUI GPU device for model/VAE loaders (e.g. default, gpu:0). Optional. */
  comfyGpuDevice?: string;
}

export type { VisualStyle, VisualStylePreset } from "@/lib/services/visual-style";
export type { ReferenceAspectRatioPreset } from "@/lib/services/reference-aspect-ratio";

export interface LocationReferenceGenerationOptions {
  /** When false, generate txt2img from prompt only (ignore saved anchor). */
  useIpAdapter?: boolean;
  /** Override IP-Adapter weight (0.1 to 0.7). */
  ipAdapterWeight?: number;
  /** Override IP-Adapter end_at (0.2 to 0.85). */
  ipAdapterEndAt?: number;
}

export interface GenerationStack {
  endpointUrl: string;
  workflowTemplateId: string;
  workflowTemplateName: string;
  comfyuiReachable: boolean;
  configuredCheckpoint: string | null;
  effectiveCheckpoint: string | null;
  needsCheckpointSelection: boolean;
  availableCheckpoints: string[];
  loras: { name: string; strength: number }[];
  sampler: {
    steps?: number;
    cfg?: number;
    sampler_name?: string;
    scheduler?: string;
  };
  ipAdapterAvailable: boolean;
}

export type MediaKind = "image" | "video";

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
export const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

export class BindingNodeMismatchError extends Error {
  code = "BINDING_NODE_MISMATCH";
  missingNodeIds: string[];

  constructor(missingNodeIds: string[]) {
    super(
      `Workflow template changed. Re-run the Binding Wizard. Missing nodes: ${missingNodeIds.join(", ")}`
    );
    this.name = "BindingNodeMismatchError";
    this.missingNodeIds = missingNodeIds;
  }
}

export class DependencyMissingError extends Error {
  code = "DEPENDENCY_MISSING";
  dependencyId: string;
  installHint: string;

  constructor(dependencyId: string, installHint: string) {
    super(`Missing dependency: ${dependencyId}`);
    this.dependencyId = dependencyId;
    this.installHint = installHint;
  }
}
