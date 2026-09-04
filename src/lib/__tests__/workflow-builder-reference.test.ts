import { describe, expect, it } from "vitest";
import {
  buildPortraitPayload,
  buildWorkflowPayload,
} from "@/lib/services/workflow-builder";
import type { Shot, WorkflowTemplate } from "@/lib/db/schema";

const staleTemplate: WorkflowTemplate = {
  id: "test-template",
  name: "Test",
  description: "",
  workflowJson: JSON.stringify({
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 24,
        cfg: 7.5,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "model.safetensors" },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 768, batch_size: 1 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: "prompt", clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: "negative", clip: ["4", 1] },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "test", images: ["8", 0] },
    },
  }),
  bindingsJson: JSON.stringify({
    promptNodeId: "6",
    promptInputKey: "text",
    negativePromptNodeId: "7",
    negativePromptInputKey: "text",
    seedNodeId: "3",
    seedInputKey: "seed",
    outputNodeIds: ["9"],
    controls: [
      {
        id: "checkpoint",
        label: "Checkpoint",
        type: "checkpoint",
        nodeId: "4",
        inputKey: "ckpt_name",
      },
    ],
  }),
  purpose: "character_sheet",
  isBuiltin: true,
  createdAt: Date.now(),
};

describe("buildPortraitPayload reference sizing", () => {
  it("overrides stale template latent size with default 16:9 preset", () => {
    const { workflow } = buildPortraitPayload(
      staleTemplate,
      JSON.parse(staleTemplate.bindingsJson),
      {},
      { prompt: "test prompt", negativePrompt: "bad", seed: 42 }
    );

    expect(workflow["5"].inputs.width).toBe(1344);
    expect(workflow["5"].inputs.height).toBe(768);
  });

  it("applies selected reference aspect ratio preset", () => {
    const { workflow } = buildPortraitPayload(
      staleTemplate,
      JSON.parse(staleTemplate.bindingsJson),
      { referenceAspectRatio: "9_16" },
      { prompt: "test prompt", negativePrompt: "bad", seed: 42 }
    );

    expect(workflow["5"].inputs.width).toBe(768);
    expect(workflow["5"].inputs.height).toBe(1344);
  });

  it("wires reference image and skips latent resize for img2img", () => {
    const img2imgTemplate: WorkflowTemplate = {
      ...staleTemplate,
      workflowJson: JSON.stringify({
        ...JSON.parse(staleTemplate.workflowJson),
        "10": {
          class_type: "LoadImage",
          inputs: { image: "placeholder.png" },
        },
        "11": {
          class_type: "VAEEncode",
          inputs: { pixels: ["10", 0], vae: ["4", 2] },
        },
      }),
      bindingsJson: JSON.stringify({
        ...JSON.parse(staleTemplate.bindingsJson),
        referenceImageNodeId: "10",
        referenceImageInputKey: "image",
      }),
    };

    const { workflow } = buildPortraitPayload(
      img2imgTemplate,
      JSON.parse(img2imgTemplate.bindingsJson),
      { referenceAspectRatio: "16_9" },
      {
        prompt: "test prompt",
        negativePrompt: "bad",
        seed: 42,
        referenceImage: "uploaded-anchor.png",
      }
    );

    expect(workflow["10"].inputs.image).toBe("uploaded-anchor.png");
    expect(workflow["5"].inputs.width).toBe(1024);
    expect(workflow["5"].inputs.height).toBe(768);
  });

  it("wires reference image and still resizes latent for ipadapter", () => {
    const ipAdapterTemplate: WorkflowTemplate = {
      ...staleTemplate,
      bindingsJson: JSON.stringify({
        ...JSON.parse(staleTemplate.bindingsJson),
        referenceImageNodeId: "10",
        referenceImageInputKey: "image",
        referenceImageUsage: "ipadapter",
      }),
      workflowJson: JSON.stringify({
        ...JSON.parse(staleTemplate.workflowJson),
        "10": {
          class_type: "LoadImage",
          inputs: { image: "placeholder.png" },
        },
      }),
    };

    const { workflow } = buildPortraitPayload(
      ipAdapterTemplate,
      JSON.parse(ipAdapterTemplate.bindingsJson),
      { referenceAspectRatio: "16_9" },
      {
        prompt: "test prompt",
        negativePrompt: "bad",
        seed: 42,
        referenceImage: "uploaded-anchor.png",
      }
    );

    expect(workflow["10"].inputs.image).toBe("uploaded-anchor.png");
    expect(workflow["5"].inputs.width).toBe(1344);
    expect(workflow["5"].inputs.height).toBe(768);
  });

  it("lowers IP-Adapter strength for extreme reframes while keeping 16:9 latent", () => {
    const ipAdapterTemplate: WorkflowTemplate = {
      ...staleTemplate,
      bindingsJson: JSON.stringify({
        ...JSON.parse(staleTemplate.bindingsJson),
        referenceImageNodeId: "10",
        referenceImageInputKey: "image",
        referenceImageUsage: "ipadapter",
      }),
      workflowJson: JSON.stringify({
        ...JSON.parse(staleTemplate.workflowJson),
        "10": {
          class_type: "LoadImage",
          inputs: { image: "placeholder.png" },
        },
        "12": {
          class_type: "IPAdapterUnifiedLoader",
          inputs: { model: ["4", 0], preset: "PLUS (high strength)" },
        },
        "13": {
          class_type: "IPAdapterAdvanced",
          inputs: {
            model: ["12", 0],
            ipadapter: ["12", 1],
            image: ["10", 0],
            weight: 0.5,
            end_at: 0.9,
            weight_type: "linear",
          },
        },
      }),
    };

    const { workflow } = buildPortraitPayload(
      ipAdapterTemplate,
      JSON.parse(ipAdapterTemplate.bindingsJson),
      { referenceAspectRatio: "16_9" },
      {
        prompt: "extreme macro close-up on stone step",
        negativePrompt: "bad",
        seed: 42,
        referenceImage: "uploaded-anchor.png",
      },
      { ipAdapterReframe: "extreme" }
    );

    expect(workflow["13"].inputs.weight).toBe(0.32);
    expect(workflow["13"].inputs.end_at).toBe(0.45);
    expect(workflow["13"].inputs.weight_type).toBe("style transfer");
    expect(workflow["12"].inputs.preset).toBe("PLUS (high strength)");
    expect(workflow["5"].inputs.width).toBe(1344);
    expect(workflow["5"].inputs.height).toBe(768);
  });

  it("wires dual IP-Adapter references with per-node reframe profiles", () => {
    const dualTemplate: WorkflowTemplate = {
      ...staleTemplate,
      bindingsJson: JSON.stringify({
        ...JSON.parse(staleTemplate.bindingsJson),
        referenceImageNodeId: "10",
        referenceImageInputKey: "image",
        secondaryReferenceImageNodeId: "11",
        secondaryReferenceImageInputKey: "image",
        characterIpAdapterNodeId: "13",
        locationIpAdapterNodeId: "14",
        referenceImageUsage: "ipadapter",
      }),
      workflowJson: JSON.stringify({
        ...JSON.parse(staleTemplate.workflowJson),
        "10": {
          class_type: "LoadImage",
          inputs: { image: "character.png" },
        },
        "11": {
          class_type: "LoadImage",
          inputs: { image: "location.png" },
        },
        "12": {
          class_type: "IPAdapterUnifiedLoader",
          inputs: { model: ["4", 0], preset: "PLUS (high strength)" },
        },
        "13": {
          class_type: "IPAdapterAdvanced",
          inputs: {
            model: ["12", 0],
            ipadapter: ["12", 1],
            image: ["10", 0],
            weight: 0.58,
            end_at: 0.78,
            weight_type: "linear",
          },
        },
        "14": {
          class_type: "IPAdapterAdvanced",
          inputs: {
            model: ["13", 0],
            ipadapter: ["12", 1],
            image: ["11", 0],
            weight: 0.38,
            end_at: 0.52,
            weight_type: "style transfer",
          },
        },
      }),
    };

    const { workflow } = buildPortraitPayload(
      dualTemplate,
      JSON.parse(dualTemplate.bindingsJson),
      { referenceAspectRatio: "16_9" },
      {
        prompt: "medium shot in the park",
        negativePrompt: "bad",
        seed: 42,
        referenceImage: "uploaded-character.png",
        secondaryReferenceImage: "uploaded-location.png",
      },
      {
        dualIpAdapterReframe: {
          character: "moderate",
          location: "subtle",
        },
      }
    );

    expect(workflow["10"].inputs.image).toBe("uploaded-character.png");
    expect(workflow["11"].inputs.image).toBe("uploaded-location.png");
    expect(workflow["13"].inputs.weight).toBe(0.38);
    expect(workflow["13"].inputs.end_at).toBe(0.5);
    expect(workflow["14"].inputs.weight).toBe(0.45);
    expect(workflow["14"].inputs.end_at).toBe(0.62);
  });
});

describe("buildWorkflowPayload shot prompts", () => {
  const videoTemplate: WorkflowTemplate = {
    id: "video-template",
    name: "Video",
    description: "",
    workflowJson: JSON.stringify({
      "319": {
        class_type: "PrimitiveStringMultiline",
        inputs: { value: "placeholder" },
      },
      "325": {
        class_type: "TextGenerateLTX2Prompt",
        inputs: { prompt: "placeholder" },
      },
      "295": {
        class_type: "EmptyLTXVLatentVideo",
        inputs: { length: 73, width: 1280, height: 720 },
      },
      "276": {
        class_type: "RandomNoise",
        inputs: { noise_seed: 0 },
      },
    }),
    bindingsJson: JSON.stringify({
      promptNodeId: "319",
      promptInputKey: "value",
      extraPromptNodes: [{ nodeId: "325", inputKey: "prompt" }],
      frameCountNodeId: "295",
      frameCountInputKey: "length",
      seedNodeId: "276",
      seedInputKey: "noise_seed",
    }),
    purpose: "shot_video",
    isBuiltin: false,
    createdAt: Date.now(),
  };

  const shot = {
    id: "shot-1",
    projectId: "proj",
    sortOrder: 0,
    title: "Shot 1",
    prompt:
      "Slow push-in as wings unfurl, dust motes drift through god rays, cinematic motion.",
    durationFrames: 73,
    renderStatus: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Shot;

  it("injects the storyboard shot prompt into primary and extra prompt nodes", () => {
    const { workflow } = buildWorkflowPayload(
      videoTemplate,
      JSON.parse(videoTemplate.bindingsJson),
      {},
      shot,
      {}
    );

    expect(workflow["319"].inputs.value).toBe(shot.prompt);
    expect(workflow["325"].inputs.prompt).toBe(shot.prompt);
  });
});
