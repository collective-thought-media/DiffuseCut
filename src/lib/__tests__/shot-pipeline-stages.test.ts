import { describe, expect, it } from "vitest";
import type {
  AssetGenerationBatch,
  AssetGenerationOption,
} from "@/lib/db/schema";
import {
  filterSelectableShotOptions,
  pipelineStageStatusLabel,
  resolveAssetOptionTemplateId,
} from "@/lib/shot-pipeline-shared";
import {
  BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

function makeOption(
  overrides: Partial<AssetGenerationOption>
): AssetGenerationOption {
  return {
    id: "opt",
    batchId: "batch",
    variantIndex: 0,
    seed: 1,
    status: "queued",
    pipelineStage: null,
    pipelineGroupId: null,
    dependsOnOptionId: null,
    comfyuiPromptId: null,
    outputPath: null,
    errorMessage: null,
    statusMessage: null,
    progress: null,
    lastHeartbeatAt: null,
    selected: false,
    createdAt: 0,
    completedAt: null,
    ...overrides,
  } as AssetGenerationOption;
}

describe("face refine pipeline stage", () => {
  it("routes face_refine options to the face refine template", () => {
    const batch = {
      workflowTemplateId: BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
    } as AssetGenerationBatch;
    expect(
      resolveAssetOptionTemplateId(
        batch,
        makeOption({ pipelineStage: "face_refine" })
      )
    ).toBe(BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID);
    expect(
      resolveAssetOptionTemplateId(batch, makeOption({ pipelineStage: "base" }))
    ).toBe(BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID);
  });

  it("shows only the refined result when a face pass is chained", () => {
    const base = makeOption({ id: "base-1", pipelineStage: "base" });
    const refine = makeOption({
      id: "refine-1",
      pipelineStage: "face_refine",
      dependsOnOptionId: "base-1",
    });
    const selectable = filterSelectableShotOptions([base, refine]);
    expect(selectable.map((option) => option.id)).toEqual(["refine-1"]);
  });

  it("supersedes composite output when face refine is chained onto it", () => {
    const character = makeOption({ id: "char-1", pipelineStage: "character" });
    const composite = makeOption({
      id: "comp-1",
      pipelineStage: "composite",
      dependsOnOptionId: "char-1",
    });
    const refine = makeOption({
      id: "refine-1",
      pipelineStage: "face_refine",
      dependsOnOptionId: "comp-1",
    });
    const selectable = filterSelectableShotOptions([
      character,
      composite,
      refine,
    ]);
    expect(selectable.map((option) => option.id)).toEqual(["refine-1"]);
  });

  it("keeps plain and composite outputs selectable without a face pass", () => {
    const plain = makeOption({ id: "plain-1" });
    const character = makeOption({ id: "char-1", pipelineStage: "character" });
    const composite = makeOption({
      id: "comp-1",
      pipelineStage: "composite",
      dependsOnOptionId: "char-1",
    });
    const selectable = filterSelectableShotOptions([
      plain,
      character,
      composite,
    ]);
    expect(selectable.map((option) => option.id)).toEqual([
      "plain-1",
      "comp-1",
    ]);
  });

  it("labels the new stages", () => {
    expect(pipelineStageStatusLabel("base")).toMatch(/face detail/i);
    expect(pipelineStageStatusLabel("face_refine")).toMatch(/face detail/i);
  });
});
