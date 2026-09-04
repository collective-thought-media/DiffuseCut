import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { Shot } from "@/lib/db/schema";
import { buildWorkflowPayload, validateBindings } from "@/lib/services/workflow-builder";

describe("minimax-i2v template bindings", () => {
  const root = path.join(process.cwd(), "templates", "minimax-i2v");
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
    id: "builtin-minimax-i2v-v1",
    name: "MiniMax",
    description: "",
    workflowJson,
    bindingsJson,
    purpose: "shot_video" as const,
    isBuiltin: true,
    createdAt: Date.now(),
  };

  const shot = {
    id: "shot-1",
    projectId: "proj",
    sortOrder: 0,
    title: "Shot 1",
    prompt: "Camera slowly pushes in.",
    durationFrames: 73,
    fps: 24,
    renderStatus: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Shot;

  it("matches workflow node ids", () => {
    expect(() => validateBindings(workflowJson, bindings)).not.toThrow();
  });

  it("injects videoTextEncoder into CLIPLoader clip_name", () => {
    const encoder = "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors";
    const { workflow } = buildWorkflowPayload(
      template,
      bindings,
      {
        videoUnet: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        videoVae: "minimax_h3_video_vae_fp16.safetensors",
        videoAudioVae: "minimax_h3_audio_vae_fp32.safetensors",
        videoTextEncoder: encoder,
      },
      shot,
      { image: "storyboard.png" }
    );

    expect(workflow["103"].inputs.clip_name).toBe(encoder);
    expect(workflow["103"].inputs.clip_name).not.toMatch(/^your_/);
  });
});
