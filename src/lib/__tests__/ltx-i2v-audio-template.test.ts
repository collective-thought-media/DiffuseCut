import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { Shot } from "@/lib/db/schema";
import {
  buildWorkflowPayload,
  validateBindings,
} from "@/lib/services/workflow-builder";

describe("ltx-i2v-audio (lip sync) template bindings", () => {
  const root = path.join(process.cwd(), "templates", "ltx-i2v-audio");
  const workflowJson = fs.readFileSync(
    path.join(root, "workflow.api.json"),
    "utf8"
  );
  const bindingsJson = fs.readFileSync(path.join(root, "bindings.json"), "utf8");
  const bindings = JSON.parse(bindingsJson);
  const workflowNodes = JSON.parse(workflowJson) as Record<
    string,
    { class_type: string; inputs: Record<string, unknown> }
  >;
  const template = {
    id: "builtin-ltx-i2v-audio-v1",
    name: "LTX lip sync",
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
    prompt: "She speaks directly to camera.",
    durationFrames: 72,
    fps: 24,
    renderStatus: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Shot;

  it("matches workflow node ids", () => {
    expect(() => validateBindings(workflowJson, bindings)).not.toThrow();
  });

  it("conditions the sampler on real audio instead of an empty audio latent", () => {
    // The empty audio latent from the base LTX template must be gone.
    const emptyAudioNodes = Object.values(workflowNodes).filter(
      (node) => node.class_type === "LTXVEmptyLatentAudio"
    );
    expect(emptyAudioNodes).toHaveLength(0);

    // LoadAudio -> TrimAudioDuration -> LTXVAudioVAEEncode -> SetLatentNoiseMask
    expect(workflowNodes["400"].class_type).toBe("LoadAudio");
    expect(workflowNodes["401"].class_type).toBe("TrimAudioDuration");
    expect(workflowNodes["401"].inputs.audio).toEqual(["400", 0]);
    expect(workflowNodes["402"].class_type).toBe("LTXVAudioVAEEncode");
    expect(workflowNodes["402"].inputs.audio).toEqual(["401", 0]);
    expect(workflowNodes["404"].class_type).toBe("SetLatentNoiseMask");
    expect(workflowNodes["404"].inputs.samples).toEqual(["402", 0]);

    // The AV concat feeding the sampler must take the masked audio latent.
    expect(workflowNodes["318"].inputs.audio_latent).toEqual(["404", 0]);
  });

  it("binds the uploaded audio file and clamps trim duration to clip length", () => {
    const { workflow } = buildWorkflowPayload(
      template,
      bindings,
      {},
      shot,
      { image: "storyboard.png", audio: "DiffuseCutLipSync-job1.wav" }
    );

    expect(workflow["400"].inputs.audio).toBe("DiffuseCutLipSync-job1.wav");
    // 72 frames at 24 fps = exactly 3 seconds of conditioning audio.
    expect(workflow["401"].inputs.duration).toBe(3);
  });

  it("caps the latent to the proven 1280x720 area budget, keeping aspect", () => {
    const { workflow } = buildWorkflowPayload(
      template,
      bindings,
      { videoWidth: 1920, videoHeight: 1080 },
      shot,
      { image: "storyboard.png", audio: "a.wav" }
    );

    // LTX 2.3 audio conditioning does not engage at 1080p; render at 720p.
    expect(workflow["295"].inputs.width).toBe(1280);
    expect(workflow["295"].inputs.height).toBe(720);
  });
});
