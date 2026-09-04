import { describe, expect, it } from "vitest";
import {
  formatMissingRenderSettingsMessage,
  getMissingRenderSettingsForBindings,
} from "@/lib/services/render-settings-validation";
import type { RenderSettings, WorkflowBindings } from "@/types";

const ltxBindings: WorkflowBindings = {
  controls: [
    {
      id: "ltx_checkpoint_te",
      label: "LTX checkpoint (TE / audio config)",
      type: "checkpoint",
      nodeId: "317",
      nameInputKey: "ckpt_name",
    },
    {
      id: "video_unet",
      label: "Video UNET",
      type: "unet",
      nodeId: "8000",
      nameInputKey: "unet_name",
    },
    {
      id: "model_device",
      label: "Model GPU device",
      type: "model_device",
      nodeId: "8010",
      inputKey: "device",
      optional: true,
    },
  ],
};

describe("render-settings-validation", () => {
  it("lists missing required binding controls", () => {
    const missing = getMissingRenderSettingsForBindings(ltxBindings, {});
    expect(missing).toContain("LTX checkpoint (TE / audio config)");
    expect(missing).toContain("Video UNET");
    expect(missing).not.toContain("Model GPU device");
  });

  it("passes when required fields are set", () => {
    const settings: RenderSettings = {
      videoCheckpoint: "ltx.safetensors",
      videoUnet: "unet.safetensors",
    };
    expect(getMissingRenderSettingsForBindings(ltxBindings, settings)).toEqual(
      []
    );
  });

  it("formats a user-facing message", () => {
    expect(
      formatMissingRenderSettingsMessage(["Video UNET", "Video VAE"])
    ).toMatch(/Video UNET/);
  });

  it("accepts sampler binding controls when video sampler settings are set", () => {
    const minimaxSamplerBindings: WorkflowBindings = {
      controls: [
        {
          id: "sampler",
          label: "Video scheduler",
          type: "sampler",
          nodeId: "108",
          inputs: { steps: "steps", scheduler: "scheduler" },
        },
        {
          id: "sampler_select",
          label: "Sampler algorithm",
          type: "sampler",
          nodeId: "109",
          inputs: { sampler_name: "sampler_name" },
        },
      ],
    };

    expect(
      getMissingRenderSettingsForBindings(minimaxSamplerBindings, {
        sampler: {
          steps: 20,
          cfg: 1,
          scheduler: "simple",
          sampler_name: "res_multistep",
        },
      })
    ).toEqual([]);
  });
});
