import { describe, expect, it } from "vitest";
import {
  EPICREALISM_XL_CHECKPOINT_FILENAME,
  filterImageGenerationCheckpoints,
  isIpAdapterFriendlyCheckpoint,
  pickDefaultImageCheckpoint,
  pickIpAdapterImageCheckpoint,
  resolveCheckpointForIpAdapter,
  shouldPreferKrea2StillEngine,
  sortImageCheckpointsForPicker,
} from "@/lib/services/image-checkpoints";

describe("image-checkpoints", () => {
  it("filters video and music checkpoints from still-image pool", () => {
    const pool = filterImageGenerationCheckpoints([
      "RealVisXL_V5.0_fp16.safetensors",
      "ltx-2.3-22b-distilled-fp8.safetensors",
      "ace_step_1.5_turbo_aio.safetensors",
      "realismFusion_v10.safetensors",
    ]);
    expect(pool).toEqual([
      "RealVisXL_V5.0_fp16.safetensors",
      "realismFusion_v10.safetensors",
    ]);
  });

  it("prefers realismFusion over RealVisXL when auto-picking", () => {
    expect(
      pickDefaultImageCheckpoint([
        "RealVisXL_V5.0_fp16.safetensors",
        "realismFusion_v10.safetensors",
      ])
    ).toBe("realismFusion_v10.safetensors");
  });

  it("flags Illustrious-family checkpoints as IP-Adapter unfriendly", () => {
    expect(isIpAdapterFriendlyCheckpoint("realismFusion_v10.safetensors")).toBe(
      false
    );
    expect(isIpAdapterFriendlyCheckpoint("RealVisXL_V5.0_fp16.safetensors")).toBe(
      true
    );
  });

  it("prefers EpicRealism for IP-Adapter workflows when available", () => {
    const pool = [
      "RealVisXL_V5.0_fp16.safetensors",
      EPICREALISM_XL_CHECKPOINT_FILENAME,
      "realismFusion_v10.safetensors",
    ];
    expect(pickIpAdapterImageCheckpoint(pool)).toBe(
      EPICREALISM_XL_CHECKPOINT_FILENAME
    );
    expect(
      resolveCheckpointForIpAdapter("realismFusion_v10.safetensors", pool)
    ).toEqual({
      checkpoint: EPICREALISM_XL_CHECKPOINT_FILENAME,
      swapped: true,
      from: "realismFusion_v10.safetensors",
    });
  });

  it("sorts EpicRealism ahead of RealVisXL in picker lists", () => {
    expect(
      sortImageCheckpointsForPicker([
        "RealVisXL_V5.0_fp16.safetensors",
        EPICREALISM_XL_CHECKPOINT_FILENAME,
        "ltx-2.3-22b-distilled-fp8.safetensors",
      ])
    ).toEqual([
      EPICREALISM_XL_CHECKPOINT_FILENAME,
      "RealVisXL_V5.0_fp16.safetensors",
      "ltx-2.3-22b-distilled-fp8.safetensors",
    ]);
  });

  it("prefers Krea only for unlocked still settings", () => {
    expect(shouldPreferKrea2StillEngine({})).toBe(true);
    expect(shouldPreferKrea2StillEngine({ imageEngine: "sdxl" })).toBe(false);
    expect(shouldPreferKrea2StillEngine({ imageEngine: "krea2" })).toBe(false);
    expect(
      shouldPreferKrea2StillEngine({
        checkpoint: "epicrealismXL_vxviiCrystalclear.safetensors",
      })
    ).toBe(false);
  });
});
