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
  /** Second reference image (e.g. location background in dual IP-Adapter shots). */
  secondaryReferenceImageNodeId?: string;
  secondaryReferenceImageInputKey?: string;
  /** Per-node IP-Adapter tuning in dual-reference workflows. */
  characterIpAdapterNodeId?: string;
  locationIpAdapterNodeId?: string;
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
  /** Still-image engine: SDXL checkpoint workflows vs local Krea 2 UNET stack. */
  imageEngine?: "sdxl" | "krea2";
  /** Krea 2 / FLUX-style still diffusion model (models/diffusion_models). */
  imageUnet?: string;
  /** Still-image VAE (e.g. qwen_image_vae for Krea 2). */
  imageVae?: string;
  /** Still-image text encoder (e.g. qwen3vl for Krea 2). */
  imageTextEncoder?: string;
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
  /** Optional extra negatives merged into all still-image generations (storyboard, sheets). */
  imageDefaultNegative?: string;
  /** ComfyUI GPU device for model/VAE loaders (e.g. default, gpu:0). Optional. */
  comfyGpuDevice?: string;
}

export type { VisualStyle, VisualStylePreset } from "@/lib/services/visual-style";
export type { ReferenceAspectRatioPreset } from "@/lib/services/reference-aspect-ratio";

import type { ShotStillReferenceMode } from "@/lib/services/shot-still-reference-mode";

export interface LocationReferenceGenerationOptions {
  /** When false, generate txt2img from prompt only (ignore saved anchor). */
  useIpAdapter?: boolean;
  /** Override IP-Adapter weight (0.1 to 0.7). */
  ipAdapterWeight?: number;
  /** Override IP-Adapter end_at (0.2 to 0.85). */
  ipAdapterEndAt?: number;
  /** Shot batch: virtual seamless backdrop (dual IP-Adapter backdrop chain). */
  virtualBackdrop?: boolean;
  /** Shot batch: user-selected reference routing (stored on enqueue). */
  stillReferenceMode?: ShotStillReferenceMode;
  /** Shot batch: which single reference image IP-Adapter uses. */
  referenceFocus?: "character" | "location";
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
  /** SDXL still-image checkpoints (excludes LTX, ACE-Step, etc.). */
  availableImageCheckpoints: string[];
  /** Active still-image engine from project render settings. */
  imageEngine: "sdxl" | "krea2";
  /** Krea 2 turbo UNET available on ComfyUI (diffusion_models). */
  krea2Available: boolean;
  /** Hydrated Krea 2 UNET filename when imageEngine is krea2. */
  effectiveImageUnet: string | null;
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
