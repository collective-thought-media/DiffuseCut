import { describe, expect, it } from "vitest";
import { gpuYieldApplies } from "@/lib/services/gpu-yield";

describe("gpuYieldApplies", () => {
  it("does nothing until a yield command is configured", () => {
    expect(gpuYieldApplies("http://127.0.0.1:8188", { command: "" })).toBe(
      false
    );
  });

  it("runs for every ComfyUI host when no host filter is set", () => {
    expect(
      gpuYieldApplies("http://127.0.0.1:8188", {
        command: "echo yield",
      })
    ).toBe(true);
  });

  it("runs only for the listed GPU hosts", () => {
    expect(
      gpuYieldApplies("http://gpu-host:8188/prompt", {
        command: "echo yield",
        hosts: "gpu-host, other",
      })
    ).toBe(true);
    expect(
      gpuYieldApplies("http://127.0.0.1:8188", {
        command: "echo yield",
        hosts: "gpu-host",
      })
    ).toBe(false);
  });
});
