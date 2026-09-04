import { describe, expect, it } from "vitest";
import {
  normalizeRenderSettings,
  resolveImageSampler,
  resolveVideoSampler,
} from "@/lib/services/image-sampler";

describe("image-sampler", () => {
  it("uses imageSampler when present", () => {
    expect(
      resolveImageSampler({
        imageSampler: { steps: 30, cfg: 8 },
        sampler: { steps: 20, cfg: 1 },
      })
    ).toEqual({
      steps: 30,
      cfg: 8,
      sampler_name: "euler",
      scheduler: "normal",
    });
  });

  it("rejects video cfg when legacy shared sampler is used for images", () => {
    expect(
      resolveImageSampler({
        checkpoint: "RealVisXL_V5.0_fp16.safetensors",
        sampler: { steps: 20, cfg: 1 },
      }).cfg
    ).toBe(7.5);
  });

  it("keeps video cfg at 1 for LTX renders", () => {
    expect(
      resolveVideoSampler({
        sampler: { steps: 20, cfg: 1 },
      }).cfg
    ).toBe(1);
  });

  it("splits legacy shared sampler into image and video blocks", () => {
    const normalized = normalizeRenderSettings({
      sampler: { steps: 20, cfg: 1 },
    });
    expect(normalized.imageSampler?.cfg).toBe(7.5);
    expect(normalized.sampler?.cfg).toBe(1);
  });
});
