/** Node classes required by bundled IP-Adapter location workflow. */
export const IP_ADAPTER_NODE_CLASSES = [
  "IPAdapterUnifiedLoader",
  "IPAdapterAdvanced",
] as const;

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

/** Sony Woosh SFX nodes (ComfyUI-Woosh custom node pack). */
export const WOOSH_NODE_CLASSES = [
  "WooshLoadFlow",
  "WooshTextEncode",
  "WooshSample",
  "SaveAudioMP3",
] as const;

export const IP_ADAPTER_MODEL_HINT =
  "ip-adapter-plus_sdxl_vit-h.safetensors";
export const CLIP_VISION_MODEL_HINT =
  "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors";

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
