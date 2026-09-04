import { describe, expect, it } from "vitest";
import {
  listAvailableShotStillReferenceModes,
  resolveShotStillReferenceEffectiveMode,
  resolveShotStillReferencePlan,
} from "@/lib/services/shot-still-reference-mode";
import {
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
} from "@/lib/db/builtin-template-ids";

const bothRefs = {
  characterPath: "characters/lisa.png",
  locationPath: "locations/park.png",
  characterName: "Lisa",
  locationStateName: "Default look",
  locationAngleName: "Park path",
};

describe("shot-still-reference-mode", () => {
  it("defaults to dual when both references exist", () => {
    expect(resolveShotStillReferenceEffectiveMode(bothRefs, "auto")).toBe(
      "dual"
    );
    const plan = resolveShotStillReferencePlan(bothRefs, "auto");
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

  it("lists modes based on available references", () => {
    expect(
      listAvailableShotStillReferenceModes({
        characterPath: "c.png",
        locationPath: null,
      })
    ).toEqual(["auto", "prompt_only", "character"]);
  });
});
