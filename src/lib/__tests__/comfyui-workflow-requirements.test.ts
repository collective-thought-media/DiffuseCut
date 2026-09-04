import { describe, expect, it } from "vitest";
import {
  IP_ADAPTER_NODE_CLASSES,
  LTX_I2V_NODE_CLASSES,
  hasAceStepModels,
  hasModelMatching,
  missingNodeClasses,
} from "@/lib/services/comfyui-workflow-requirements";

describe("comfyui-workflow-requirements", () => {
  it("lists missing IP-Adapter nodes", () => {
    const objectInfo = { IPAdapterUnifiedLoader: {} };
    expect(missingNodeClasses(objectInfo, IP_ADAPTER_NODE_CLASSES)).toEqual([
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
