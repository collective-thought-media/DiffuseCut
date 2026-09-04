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

/** SDXL stills (storyboard frames, character/location sheets). */
export function resolveImageSampler(
  settings: RenderSettings
): SamplerSettings {
  if (settings.imageSampler) {
    return { ...DEFAULT_IMAGE_SAMPLER, ...settings.imageSampler };
  }

  if (settings.sampler) {
    const cfg = settings.sampler.cfg ?? DEFAULT_IMAGE_SAMPLER.cfg!;
    return {
      ...DEFAULT_IMAGE_SAMPLER,
      ...settings.sampler,
      cfg: cfg <= 2 ? DEFAULT_IMAGE_SAMPLER.cfg! : cfg,
    };
  }

  return { ...DEFAULT_IMAGE_SAMPLER };
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

  normalized.imageSampler = {
    ...DEFAULT_IMAGE_SAMPLER,
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
