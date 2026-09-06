import { describe, expect, it } from "vitest";
import {
  listAvailableShotStillReferenceModes,
  resolveShotStillReferenceEffectiveMode,
  resolveShotStillReferencePlan,
} from "@/lib/services/shot-still-reference-mode";
import {
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID,
  BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

const bothRefs = {
  characterPath: "characters/lisa.png",
  locationPath: "locations/park.png",
  characterName: "Lisa",
  locationStateName: "Default look",
  locationAngleName: "Park path",
};

describe("shot-still-reference-mode", () => {
  it("defaults to integrate in scene when both references exist", () => {
    expect(resolveShotStillReferenceEffectiveMode(bothRefs, "auto")).toBe(
      "integrate_in_scene"
    );
    const plan = resolveShotStillReferencePlan(bothRefs, "auto");
    expect(plan.useDualIpAdapter).toBe(false);
    expect(plan.useIpAdapter).toBe(true);
    expect(plan.characterPath).toBe("characters/lisa.png");
    expect(plan.locationPath).toBe("locations/park.png");
    expect(plan.hasLocationReferenceForPrompt).toBe(true);
    expect(plan.workflowTemplateId).toBe(
      BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID
    );
  });

  it("routes dual explicitly to the dual IP-Adapter template", () => {
    expect(resolveShotStillReferenceEffectiveMode(bothRefs, "dual")).toBe(
      "dual"
    );
    const plan = resolveShotStillReferencePlan(bothRefs, "dual");
    expect(plan.useDualIpAdapter).toBe(true);
    expect(plan.workflowTemplateId).toBe(
      BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID
    );
  });

  it("routes to character-only single IP-Adapter", () => {
    const plan = resolveShotStillReferencePlan(bothRefs, "character");
    expect(plan.effectiveMode).toBe("character");
    expect(plan.useDualIpAdapter).toBe(false);
    expect(plan.referenceFocus).toBe("character");
    expect(plan.primaryPath).toBe("characters/lisa.png");
    expect(plan.workflowTemplateId).toBe(
      BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID
    );
    expect(plan.hasLocationReferenceForPrompt).toBe(false);
    expect(plan.includeDualLayoutSuffix).toBe(false);
  });

  it("routes to location-only single IP-Adapter", () => {
    const plan = resolveShotStillReferencePlan(bothRefs, "location");
    expect(plan.effectiveMode).toBe("location");
    expect(plan.referenceFocus).toBe("location");
    expect(plan.hasLocationReferenceForPrompt).toBe(true);
  });

  it("skips IP-Adapter for prompt only", () => {
    const plan = resolveShotStillReferencePlan(bothRefs, "prompt_only");
    expect(plan.effectiveMode).toBe("prompt_only");
    expect(plan.useIpAdapter).toBe(false);
    expect(plan.workflowTemplateId).toBeNull();
    expect(plan.generationOptions.useIpAdapter).toBe(false);
  });

  it("lists integrate in scene when both references exist", () => {
    expect(listAvailableShotStillReferenceModes(bothRefs)).toContain(
      "integrate_in_scene"
    );
  });

  it("routes integrate in scene to the masked inpaint template", () => {
    const plan = resolveShotStillReferencePlan(bothRefs, "integrate_in_scene", {
      compositingPipelineAvailable: true,
    });
    expect(plan.effectiveMode).toBe("integrate_in_scene");
    expect(plan.useDualIpAdapter).toBe(false);
    expect(plan.useCompositingPipeline).toBe(false);
    expect(plan.useIpAdapter).toBe(true);
    expect(plan.workflowTemplateId).toBe(
      BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID
    );
    expect(plan.characterPath).toBe("characters/lisa.png");
    expect(plan.locationPath).toBe("locations/park.png");
    expect(plan.hasLocationReferenceForPrompt).toBe(true);
    // Masked inpaint: denoise applies inside the subject region only, and must
    // be near 1.0 so the subject fully forms instead of ghost-blending.
    expect(plan.generationOptions.locationPlateDenoise).toBe(0.9);
    expect(plan.generationOptions.integrateSubjectHeightFraction).toBe(0.32);
    expect(plan.generationOptions.integrateSubjectAnchorX).toBe(0.5);
    expect(plan.generationOptions.stillReferenceMode).toBe("integrate_in_scene");
    // Style-transfer character IP keeps identity and outfit but drops the
    // casting reference's pose/composition (a crouched reference must not
    // dictate the shot pose).
    expect(plan.generationOptions.ipAdapterWeight).toBe(0.6);
    expect(plan.generationOptions.ipAdapterEndAt).toBe(0.55);
    expect(plan.generationOptions.ipAdapterWeightType).toBe("style transfer");
    expect(plan.label).toContain("integrate in scene");
  });

  it("auto prefers integrate in scene so Subject size controls a real mask", () => {
    const plan = resolveShotStillReferencePlan(bothRefs, "auto", {
      sceneEditAvailable: true,
    });
    expect(plan.effectiveMode).toBe("integrate_in_scene");
  });

  it("lists scene edit when both references exist", () => {
    expect(listAvailableShotStillReferenceModes(bothRefs)).toContain(
      "scene_edit"
    );
  });

  it("routes scene edit to the Qwen image edit template without IP-Adapter", () => {
    const plan = resolveShotStillReferencePlan(bothRefs, "scene_edit");
    expect(plan.effectiveMode).toBe("scene_edit");
    expect(plan.useIpAdapter).toBe(false);
    expect(plan.useDualIpAdapter).toBe(false);
    expect(plan.useCompositingPipeline).toBe(false);
    expect(plan.workflowTemplateId).toBe(BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID);
    expect(plan.characterPath).toBe("characters/lisa.png");
    expect(plan.locationPath).toBe("locations/park.png");
    expect(plan.hasLocationReferenceForPrompt).toBe(true);
    // Editing model: no SDXL-era knobs.
    expect(plan.generationOptions.ipAdapterWeight).toBeUndefined();
    expect(plan.generationOptions.locationPlateDenoise).toBeUndefined();
    expect(plan.generationOptions.integrateSubjectHeightFraction).toBeUndefined();
    expect(plan.label).toContain("scene edit");
  });

  it("degrades scene edit to character-only when location missing", () => {
    expect(
      resolveShotStillReferenceEffectiveMode(
        { characterPath: "characters/lisa.png", locationPath: null },
        "scene_edit"
      )
    ).toBe("character");
  });

  it("does not set integrate IP overrides for other modes", () => {
    const dualPlan = resolveShotStillReferencePlan(bothRefs, "dual");
    expect(dualPlan.generationOptions.ipAdapterWeight).toBeUndefined();
    expect(dualPlan.generationOptions.ipAdapterEndAt).toBeUndefined();
    const compositedPlan = resolveShotStillReferencePlan(bothRefs, "composited", {
      compositingPipelineAvailable: true,
    });
    expect(compositedPlan.generationOptions.ipAdapterWeight).toBeUndefined();
    expect(compositedPlan.generationOptions.ipAdapterEndAt).toBeUndefined();
  });

  it("degrades integrate in scene to character-only when location missing", () => {
    expect(
      resolveShotStillReferenceEffectiveMode(
        { characterPath: "characters/lisa.png", locationPath: null },
        "integrate_in_scene"
      )
    ).toBe("character");
  });

  it("lists composited when both references exist", () => {
    expect(listAvailableShotStillReferenceModes(bothRefs)).toContain(
      "composited"
    );
  });

  it("routes composited to location plate when compositing nodes unavailable", () => {
    const plan = resolveShotStillReferencePlan(bothRefs, "composited", {
      compositingPipelineAvailable: false,
    });
    expect(plan.effectiveMode).toBe("composited");
    expect(plan.useCompositingPipeline).toBe(false);
    expect(plan.workflowTemplateId).toBe(
      BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID
    );
    expect(plan.generationOptions.locationPlateDenoise).toBe(0.42);
  });

  it("routes composited to multi-stage pipeline when compositing nodes available", () => {
    const plan = resolveShotStillReferencePlan(bothRefs, "composited", {
      compositingPipelineAvailable: true,
    });
    expect(plan.useCompositingPipeline).toBe(true);
    expect(plan.workflowTemplateId).toBe(
      BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID
    );
    expect(plan.generationOptions.compositeInpaintDenoise).toBe(0.48);
    expect(plan.generationOptions.compositeColorMatchFactor).toBe(0.78);
  });
});
