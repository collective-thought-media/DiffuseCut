import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  extractTemplateRenderDefaults,
  loadKnownGoodVideoSettingsFromDb,
  mergeRenderSettings,
  stripVideoStackSettings,
} from "@/lib/services/render-settings-resolver";

describe("render-settings-resolver", () => {
  it("merges layers without empty overrides", () => {
    expect(
      mergeRenderSettings(
        { checkpoint: "a.safetensors", videoWidth: 1920 },
        { checkpoint: "", videoUnet: "unet.safetensors" },
        { videoHeight: 1080 }
      )
    ).toEqual({
      checkpoint: "a.safetensors",
      videoUnet: "unet.safetensors",
      videoWidth: 1920,
      videoHeight: 1080,
    });
  });

  it("extracts width and height from LTX template workflow", () => {
    const root = path.join(process.cwd(), "templates", "ltx-i2v");
    const defaults = extractTemplateRenderDefaults({
      workflowJson: fs.readFileSync(
        path.join(root, "workflow.api.json"),
        "utf8"
      ),
      bindingsJson: fs.readFileSync(path.join(root, "bindings.json"), "utf8"),
    });

    expect(defaults.videoWidth).toBe(1920);
    expect(defaults.videoHeight).toBe(1080);
    expect(defaults.videoUnet).toBeUndefined();
  });

  it("extracts MiniMax H3 defaults from builtin template", () => {
    const root = path.join(process.cwd(), "templates", "minimax-i2v");
    const defaults = extractTemplateRenderDefaults({
      workflowJson: fs.readFileSync(
        path.join(root, "workflow.api.json"),
        "utf8"
      ),
      bindingsJson: fs.readFileSync(path.join(root, "bindings.json"), "utf8"),
    });

    expect(defaults.videoWidth).toBe(1344);
    expect(defaults.videoHeight).toBe(768);
    expect(defaults.videoUnet).toBeUndefined();
  });

  it("loads known-good video settings from completed renders when DB exists", () => {
    const settings = loadKnownGoodVideoSettingsFromDb();
    if (Object.keys(settings).length > 0) {
      expect(settings.videoTextEncoder?.toLowerCase()).toContain("gemma");
    }
  });

  it("stripVideoStackSettings removes video model fields but keeps image checkpoint", () => {
    expect(
      stripVideoStackSettings({
        checkpoint: "RealVisXL.safetensors",
        imageSampler: { steps: 24, cfg: 7.5 },
        videoCheckpoint: "ltx.safetensors",
        videoUnet: "ltx-unet.safetensors",
        videoVae: "ltx-vae.safetensors",
        videoWidth: 1920,
        sampler: { steps: 20, cfg: 1 },
      })
    ).toEqual({
      checkpoint: "RealVisXL.safetensors",
      imageSampler: { steps: 24, cfg: 7.5 },
    });
  });

  it("template-scoped merge drops stale LTX video fields before template defaults", () => {
    const ltxProject = {
      videoCheckpoint: "ltx-2.3.safetensors",
      videoUnet: "ltx-2.3-unet.safetensors",
      videoVae: "LTX23_video_vae_bf16.safetensors",
      videoTextEncoder: "gemma_3_12B_it_fp4_mixed.safetensors",
      videoWidth: 1920,
      videoHeight: 1080,
      checkpoint: "RealVisXL.safetensors",
    };
    const minimaxDefaults = extractTemplateRenderDefaults({
      workflowJson: fs.readFileSync(
        path.join(process.cwd(), "templates", "minimax-i2v", "workflow.api.json"),
        "utf8"
      ),
      bindingsJson: fs.readFileSync(
        path.join(process.cwd(), "templates", "minimax-i2v", "bindings.json"),
        "utf8"
      ),
    });

    const merged = mergeRenderSettings(
      stripVideoStackSettings(ltxProject),
      minimaxDefaults
    );

    expect(merged.checkpoint).toBe("RealVisXL.safetensors");
    expect(merged.videoUnet).toBeUndefined();
    expect(merged.videoCheckpoint).toBeUndefined();
    expect(merged.videoWidth).toBe(1344);
    expect(merged.videoHeight).toBe(768);
  });
});
