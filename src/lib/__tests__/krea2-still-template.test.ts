import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { Shot } from "@/lib/db/schema";
import { buildPortraitPayload, validateBindings } from "@/lib/services/workflow-builder";

describe("krea2-still template bindings", () => {
  const root = path.join(process.cwd(), "templates", "krea2-still");
  const workflowJson = fs.readFileSync(
    path.join(root, "workflow.api.json"),
    "utf8"
  );
  const bindingsJson = fs.readFileSync(
    path.join(root, "bindings.json"),
    "utf8"
  );
  const bindings = JSON.parse(bindingsJson);
  const template = {
    id: "builtin-krea2-still-v1",
    name: "Krea 2 turbo",
    description: "",
    workflowJson,
    bindingsJson,
    purpose: "character_sheet" as const,
    isBuiltin: true,
    createdAt: Date.now(),
  };

  const shot = {
    id: "shot-1",
    projectId: "proj",
    sortOrder: 0,
    title: "Shot 1",
    prompt: "Neutral gray studio portrait.",
    durationFrames: 1,
    fps: 24,
    renderStatus: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Shot;

  it("matches workflow node ids", () => {
    expect(() => validateBindings(workflowJson, bindings)).not.toThrow();
  });

  it("injects Krea stack models and sampler settings", () => {
    const unet = "krea2_turbo_fp8_scaled.safetensors";
    const vae = "qwen_image_vae.safetensors";
    const encoder = "qwen3vl_4b_fp8_scaled.safetensors";
    const { workflow } = buildPortraitPayload(
      template,
      bindings,
      {
        imageEngine: "krea2",
        imageUnet: unet,
        imageVae: vae,
        imageTextEncoder: encoder,
        imageSampler: {
          steps: 8,
          cfg: 1,
          sampler_name: "euler",
          scheduler: "simple",
        },
      },
      {
        prompt: shot.prompt,
        negativePrompt: "blurry",
        seed: 42,
      }
    );

    expect(workflow["10"].inputs.unet_name).toBe(unet);
    expect(workflow["12"].inputs.vae_name).toBe(vae);
    expect(workflow["11"].inputs.clip_name).toBe(encoder);
    expect(workflow["3"].inputs.steps).toBe(8);
    expect(workflow["3"].inputs.cfg).toBe(1);
    expect(workflow["6"].inputs.text).toBe(shot.prompt);
    expect(workflow["7"].inputs.text).toBe("blurry");
  });
});
