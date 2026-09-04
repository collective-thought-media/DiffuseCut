import { describe, expect, it } from "vitest";
import {
  IP_ADAPTER_NODE_CLASSES,
  LTX_I2V_NODE_CLASSES,
  hasAceStepModels,
  hasModelMatching,
  hasSdxlPlusIpAdapterModel,
  hasSdxlPlusIpAdapterPresetFilename,
  missingNodeClasses,
} from "@/lib/services/comfyui-workflow-requirements";

describe("comfyui-workflow-requirements", () => {
  it("lists missing IP-Adapter nodes", () => {
    const objectInfo = { IPAdapterModelLoader: {} };
    expect(missingNodeClasses(objectInfo, IP_ADAPTER_NODE_CLASSES)).toEqual([
      "CLIPVisionLoader",
      "IPAdapterAdvanced",
    ]);
  });

  it("lists missing LTX nodes", () => {
    const objectInfo = {
      LTXVImgToVideoInplace: {},
      EmptyLTXVLatentVideo: {},
    };
    expect(missingNodeClasses(objectInfo, LTX_I2V_NODE_CLASSES)).toEqual([
      "LTXAVTextEncoderLoader",
      "LTXVAudioVAELoader",
    ]);
  });

  it("matches model filenames case-insensitively", () => {
    expect(
      hasModelMatching(
        ["ip-adapter-plus_sdxl_vit-h.safetensors"],
        "ip-adapter-plus"
      )
    ).toBe(true);
  });

  it("accepts legacy and preset PLUS SDXL filenames", () => {
    expect(
      hasSdxlPlusIpAdapterModel(["ip-adapter-plus_sdxl_vit-h.safetensors"])
    ).toBe(true);
    expect(
      hasSdxlPlusIpAdapterPresetFilename(["plus.sdxl.vit.h.safetensors"])
    ).toBe(true);
    expect(
      hasSdxlPlusIpAdapterPresetFilename([
        "ip-adapter-plus_sdxl_vit-h.safetensors",
      ])
    ).toBe(false);
  });

  it("detects ACE-Step aio checkpoint", () => {
    expect(
      hasAceStepModels({
        checkpoints: ["ace_step_1.5_turbo_aio.safetensors"],
        ipadapter: [],
        clipVision: [],
        unet: [],
        vae: [],
        diffusionModels: [],
        textEncoders: [],
      })
    ).toBe(true);
  });
});
