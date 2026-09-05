export type DependencyId =
  | "node"
  | "npm_deps"
  | "app_data_dir"
  | "ffmpeg"
  | "comfyui"
  | "comfyui_checkpoints"
  | "comfyui_ipadapter"
  | "comfyui_compositing"
  | "comfyui_qwen_edit"
  | "comfyui_face_refine"
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
  /** Location plate for composited shots (img2img latent from saved angle). */
  locationPlateImageNodeId?: string;
  locationPlateImageInputKey?: string;
  /** Gaussian blur on location plate before composite. */
  backgroundBlurNodeId?: string;
  backgroundBlurRadiusInputKey?: string;
  backgroundBlurSigmaInputKey?: string;
  /** Scale character isolate before compositing. */
  characterScaleNodeId?: string;
  characterScaleWidthInputKey?: string;
  characterScaleHeightInputKey?: string;
  /** Foreground paste layer from the character isolate stage. */
  characterIsolateImageNodeId?: string;
  characterIsolateImageInputKey?: string;
  /** Place scaled character on blurred plate. */
  compositeNodeId?: string;
  compositeXInputKey?: string;
  compositeYInputKey?: string;
  /** Soften subject mask edges before paste (MaskBlur+). */
  maskBlurNodeId?: string;
  maskBlurAmountInputKey?: string;
  /** Match cutout color to location plate before paste (ImageColorMatch+). */
  colorMatchNodeId?: string;
  colorMatchFactorInputKey?: string;
  /** Integrate in scene: full-frame empty SolidMask (sized to the plate). */
  subjectMaskFrameNodeId?: string;
  /** Integrate in scene: subject-region SolidMask (box that gets denoised). */
  subjectMaskBoxNodeId?: string;
  /** Integrate in scene: MaskComposite placing the box on the frame. */
  subjectMaskCompositeNodeId?: string;
  /** Integrate in scene: FeatherMask softening the box edges. */
  subjectMaskFeatherNodeId?: string;
  /** img2img encodes the reference into the latent; ipadapter keeps txt2img composition freedom. */
  referenceImageUsage?:
    | "img2img"
    | "ipadapter"
    | "location_plate"
    | "composite_inpaint"
    | "scene_edit"
    | "face_refine";
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
  /** LoadAudio node for audio-conditioned video (lip sync) workflows. */
  audioInputNodeId?: string;
  audioInputInputKey?: string;
  /** TrimAudioDuration node: clamps the conditioning audio to clip length. */
  audioTrimDurationNodeId?: string;
  audioTrimDurationInputKey?: string;
  durationSecondsNodeId?: string;
  durationSecondsInputKey?: string;
  outputFilenameNodeId?: string;
  outputFilenameInputKey?: string;
  latentVideoNodeId?: string;
  latentVideoWidthInputKey?: string;
  latentVideoHeightInputKey?: string;
  /**
   * Max latent area in pixels (width x height). Render dimensions above the
   * budget are scaled down proportionally (multiples of 16). LTX 2.3 audio
   * conditioning only engages near its training resolution (~1280x720), so
   * the lip sync template caps at 921600 regardless of project render size.
   */
  latentVideoAreaBudget?: number;
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
  /**
   * Override IP-Adapter weight type. "style transfer" carries appearance
   * without the reference image's pose/composition (integrate in scene).
   */
  ipAdapterWeightType?: "linear" | "style transfer";
  /**
   * Integrate in scene: subject feet line as a fraction of plate height.
   * Above 1 means feet below the frame (medium shot / close-up framing).
   */
  integrateSubjectGroundY?: number;
  /** Shot batch: virtual seamless backdrop (dual IP-Adapter backdrop chain). */
  virtualBackdrop?: boolean;
  /**
   * Instruction edit batch: project-relative path of the finished still being
   * edited (uploaded to ComfyUI as the edit source).
   */
  imageEditSourcePath?: string;
  /** Shot batch: user-selected reference routing (stored on enqueue). */
  stillReferenceMode?: ShotStillReferenceMode;
  /** Shot batch: which single reference image IP-Adapter uses. */
  referenceFocus?: "character" | "location";
  /** Partial denoise when initializing from location plate (Phase 1 composited). */
  locationPlateDenoise?: number;
  /** Integrate in scene: subject mask height as a fraction of frame height. */
  integrateSubjectHeightFraction?: number;
  /** Integrate in scene: horizontal center of the subject mask (0 to 1). */
  integrateSubjectAnchorX?: number;
  /** Seam blend denoise for composite inpaint (Phase 3). */
  compositeInpaintDenoise?: number;
  /** Background defocus strength for composite stage. */
  compositeBackgroundBlurRadius?: number;
  compositeBackgroundBlurSigma?: number;
  /** Foreground subject size and placement on the plate (pixels). */
  compositeCharacterWidth?: number;
  compositeCharacterHeight?: number;
  compositeCharacterX?: number;
  compositeCharacterY?: number;
  /** MaskBlur+ amount before paste in composite stage. */
  compositeMaskBlurAmount?: number;
  /** ImageColorMatch+ factor (0 to 1) before paste. */
  compositeColorMatchFactor?: number;
  /** Run character isolate then composite inpaint when ComfyUI nodes are available. */
  useCompositingPipeline?: boolean;
  /** Character sheet: generate intentional front+back diptych for paired angle split. */
  frontBackDiptych?: boolean;
}

export type AssetPipelineStage = "character" | "composite";

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
  compositingAvailable: boolean;
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
