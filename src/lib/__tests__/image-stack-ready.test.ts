import { describe, expect, it } from "vitest";
import {
  isImageStackReady,
  resolvedImageStackCheckpoint,
} from "@/lib/services/image-stack-ready";

const epic = "epicrealismXL_vxviiCrystalclear.safetensors";

describe("image-stack-ready", () => {
  it("does not treat a displayed fallback as selected when nothing is saved", () => {
    expect(
      resolvedImageStackCheckpoint({
        configuredCheckpoint: null,
        effectiveCheckpoint: epic,
        availableImageCheckpoints: [epic],
      })
    ).toBe(epic);
  });

  it("is ready when ComfyUI is up and an effective checkpoint is on the server", () => {
    expect(
      isImageStackReady({
        comfyuiReachable: true,
        configuredCheckpoint: null,
        effectiveCheckpoint: epic,
        availableImageCheckpoints: [epic],
      })
    ).toBe(true);
  });

  it("is not ready when ComfyUI is down", () => {
    expect(
      isImageStackReady({
        comfyuiReachable: false,
        configuredCheckpoint: epic,
        availableImageCheckpoints: [epic],
      })
    ).toBe(false);
  });
});
