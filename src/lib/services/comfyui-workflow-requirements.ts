/** Node classes required by bundled IP-Adapter workflows. */
export const IP_ADAPTER_NODE_CLASSES = [
  "IPAdapterModelLoader",
  "CLIPVisionLoader",
  "IPAdapterAdvanced",
] as const;

export const IP_ADAPTER_SDXL_PLUS_FILENAME = "plus.sdxl.vit.h.safetensors";
export const IP_ADAPTER_SDXL_PLUS_LEGACY_FILENAME =
  "ip-adapter-plus_sdxl_vit-h.safetensors";
export const CLIP_VISION_SDXL_FILENAME =
  "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors";

/** Core node classes from the bundled LTX 2.3 I2V shot workflow. */
export const LTX_I2V_NODE_CLASSES = [
  "LTXVImgToVideoInplace",
  "EmptyLTXVLatentVideo",
  "LTXAVTextEncoderLoader",
  "LTXVAudioVAELoader",
] as const;

/** Core node classes from the bundled MiniMax H3 I2V shot workflow. */
export const MINIMAX_I2V_NODE_CLASSES = [
  "MiniMaxH3ImageToVideo",
  "MiniMaxH3SigmaShift",
  "VAEDecodeAudio",
] as const;

/** Native ACE-Step 1.5 music nodes (ComfyUI nightly / recent release). */
export const ACE_STEP_NODE_CLASSES = [
  "TextEncodeAceStepAudio1.5",
  "EmptyAceStep1.5LatentAudio",
  "VAEDecodeAudio",
] as const;

export const ACE_STEP_SAVE_NODE_CLASSES = ["SaveAudioMP3", "SaveAudio"] as const;

export const ACE_STEP_AIO_CHECKPOINT = "ace_step_1.5_turbo_aio.safetensors";

/**
 * Qwen Image Edit stack nodes (Scene edit shot mode and instruction edits of
 * finished stills). All core ComfyUI; an outdated build is the usual gap.
 */
export const QWEN_IMAGE_EDIT_NODE_CLASSES = [
  "UNETLoader",
  "TextEncodeQwenImageEditPlus",
  "ModelSamplingAuraFlow",
  "LoraLoaderModelOnly",
] as const;

export const QWEN_IMAGE_EDIT_MODEL_HINT =
  "qwen_image_edit_2511_fp8mixed.safetensors in models/diffusion_models (Comfy-Org/Qwen-Image-Edit_ComfyUI 2511 split files)";
export const QWEN_IMAGE_EDIT_TEXT_ENCODER_HINT =
  "qwen_2.5_vl_7b_fp8_scaled.safetensors in models/text_encoders";
export const QWEN_IMAGE_EDIT_VAE_HINT =
  "qwen_image_vae.safetensors in models/vae";
export const QWEN_IMAGE_EDIT_LORA_HINT =
  "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors in models/loras (lightx2v/Qwen-Image-Edit-2511-Lightning)";

/** Model weights the bundled Qwen Image Edit workflows load by name. */
export function missingQwenImageEditModels(
  models: ComfyModelFolders
): string[] {
  const issues: string[] = [];
  if (!hasModelMatching(models.diffusionModels, "qwen_image_edit")) {
    issues.push(`Qwen Image Edit weights not found (${QWEN_IMAGE_EDIT_MODEL_HINT})`);
  }
  if (!hasModelMatching(models.textEncoders, "qwen_2.5_vl")) {
    issues.push(
      `Qwen text encoder not found (${QWEN_IMAGE_EDIT_TEXT_ENCODER_HINT})`
    );
  }
  if (!hasModelMatching(models.vae, "qwen_image_vae")) {
    issues.push(`Qwen VAE not found (${QWEN_IMAGE_EDIT_VAE_HINT})`);
  }
  const loras = models.loras ?? [];
  if (
    !loras.some((name) => {
      const lower = name.toLowerCase();
      return lower.includes("qwen") && lower.includes("lightning");
    })
  ) {
    issues.push(`Lightning LoRA not found (${QWEN_IMAGE_EDIT_LORA_HINT})`);
  }
  return issues;
}

/** Sony Woosh SFX nodes (ComfyUI-Woosh custom node pack). */
export const WOOSH_NODE_CLASSES = [
  "WooshLoadFlow",
  "WooshTextEncode",
  "WooshSample",
  "SaveAudioMP3",
] as const;

export const IP_ADAPTER_MODEL_HINT =
  "plus.sdxl.vit.h.safetensors (ComfyUI_IPAdapter_plus PLUS preset)";
export const IP_ADAPTER_MODEL_LEGACY_HINT =
  "ip-adapter-plus_sdxl_vit-h.safetensors";
export const CLIP_VISION_MODEL_HINT =
  "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors";

/** Names accepted by IPAdapterUnifiedLoader preset PLUS (high strength) on SDXL. */
export function hasSdxlPlusIpAdapterModel(models: string[]): boolean {
  return models.some((name) => {
    const lower = name.toLowerCase();
    return (
      /^plus\.sdxl\.vit\.h\.(safetensors|bin)$/i.test(name) ||
      lower.includes("ip-adapter-plus_sdxl") ||
      lower.includes("ip-adapter-plus-sdxl")
    );
  });
}

/** PLUS preset requires plus.sdxl.vit.h.*; legacy Hugging Face names alone fail at runtime. */
export function hasSdxlPlusIpAdapterPresetFilename(models: string[]): boolean {
  return models.some((name) =>
    /^plus\.sdxl\.vit\.h\.(safetensors|bin)$/i.test(name)
  );
}

/** Prefer cubiq preset filename; fall back to legacy Hugging Face name. */
export function resolveSdxlPlusIpAdapterFilename(
  models: string[]
): string | null {
  const preset = models.find((name) =>
    /^plus\.sdxl\.vit\.h\.(safetensors|bin)$/i.test(name)
  );
  if (preset) return preset;

  const legacy = models.find((name) => {
    const lower = name.toLowerCase();
    return (
      lower.includes("ip-adapter-plus_sdxl") ||
      lower.includes("ip-adapter-plus-sdxl")
    );
  });
  return legacy ?? null;
}

/**
 * Prefer a face-specific SDXL IP-Adapter (plus-face) for face refinement;
 * fall back to the generic plus model when none is installed.
 */
export function resolveSdxlPlusFaceIpAdapterFilename(
  models: string[]
): string | null {
  const face = models.find((name) => {
    const lower = name.toLowerCase();
    return (
      lower.includes("plus-face") && lower.includes("sdxl")
    );
  });
  if (face) return face;
  return resolveSdxlPlusIpAdapterFilename(models);
}

export function missingNodeClasses(
  objectInfo: Record<string, unknown>,
  classTypes: readonly string[]
): string[] {
  return classTypes.filter((classType) => !(classType in objectInfo));
}

export function hasModelMatching(models: string[], fragment: string): boolean {
  const needle = fragment.toLowerCase();
  return models.some((name) => name.toLowerCase().includes(needle));
}

export interface ComfyModelFolders {
  checkpoints: string[];
  ipadapter: string[];
  clipVision: string[];
  unet: string[];
  vae: string[];
  diffusionModels: string[];
  textEncoders: string[];
  /** Optional: only loaded by callers that need LoRA detection. */
  loras?: string[];
}

export function hasAceStepModels(models: ComfyModelFolders): boolean {
  if (hasModelMatching(models.checkpoints, "ace_step")) {
    return true;
  }

  const hasDiffusion = hasModelMatching(models.diffusionModels, "acestep");
  const hasVae = hasModelMatching(models.vae, "ace");
  const hasTextEncoder = models.textEncoders.some(
    (name) =>
      name.toLowerCase().includes("ace") ||
      name.toLowerCase().includes("qwen")
  );

  return hasDiffusion && hasVae && hasTextEncoder;
}

export function resolveAceStepCheckpoint(
  models: ComfyModelFolders,
  preferred?: string | null
): string | null {
  const trimmed = preferred?.trim();
  if (trimmed && models.checkpoints.includes(trimmed)) {
    return trimmed;
  }

  const aio = models.checkpoints.find((name) =>
    name.toLowerCase().includes("ace_step")
  );
  return aio ?? null;
}
