import type { RenderSettings } from "@/types";

export type SamplerSettings = NonNullable<RenderSettings["sampler"]>;

export const DEFAULT_IMAGE_SAMPLER: SamplerSettings = {
  steps: 24,
  cfg: 7.5,
  sampler_name: "euler",
  scheduler: "normal",
};

export const DEFAULT_VIDEO_SAMPLER: SamplerSettings = {
  steps: 20,
  cfg: 1,
  sampler_name: "euler",
  scheduler: "normal",
};

export const DEFAULT_KREA2_IMAGE_SAMPLER: SamplerSettings = {
  steps: 8,
  cfg: 1,
  sampler_name: "euler",
  scheduler: "simple",
};

/** SDXL stills (storyboard frames, character/location sheets). */
export function resolveImageSampler(
  settings: RenderSettings
): SamplerSettings {
  const kreaDefaults =
    settings.imageEngine === "krea2" ? DEFAULT_KREA2_IMAGE_SAMPLER : DEFAULT_IMAGE_SAMPLER;

  if (settings.imageSampler) {
    return { ...kreaDefaults, ...settings.imageSampler };
  }

  if (settings.sampler) {
    const cfg = settings.sampler.cfg ?? kreaDefaults.cfg!;
    return {
      ...kreaDefaults,
      ...settings.sampler,
      cfg:
        settings.imageEngine === "krea2"
          ? (settings.sampler.cfg ?? kreaDefaults.cfg!)
          : cfg <= 2
            ? DEFAULT_IMAGE_SAMPLER.cfg!
            : cfg,
    };
  }

  return { ...kreaDefaults };
}

/** LTX and other video workflow samplers. */
export function resolveVideoSampler(
  settings: RenderSettings
): SamplerSettings {
  return { ...DEFAULT_VIDEO_SAMPLER, ...settings.sampler };
}

/** Ensure image and video sampler blocks are split after legacy shared `sampler`. */
export function normalizeRenderSettings(
  settings: RenderSettings
): RenderSettings {
  const normalized = { ...settings };
  const videoSampler = resolveVideoSampler(normalized);
  const imageSampler = resolveImageSampler(normalized);
  const imageDefaults =
    normalized.imageEngine === "krea2"
      ? DEFAULT_KREA2_IMAGE_SAMPLER
      : DEFAULT_IMAGE_SAMPLER;

  normalized.imageSampler = {
    ...imageDefaults,
    ...normalized.imageSampler,
    ...imageSampler,
  };
  normalized.sampler = {
    ...DEFAULT_VIDEO_SAMPLER,
    ...normalized.sampler,
    ...videoSampler,
  };

  return normalized;
}
