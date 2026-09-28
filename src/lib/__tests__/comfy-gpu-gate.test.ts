import { describe, expect, it } from "vitest";
import {
  comfyEndpointKey,
  sameComfyEndpoint,
} from "@/lib/services/comfy-gpu-gate";

describe("comfy-gpu-gate endpoints", () => {
  it("treats trailing slashes and default paths as the same host", () => {
    expect(
      sameComfyEndpoint("http://127.0.0.1:8188", "http://127.0.0.1:8188/")
    ).toBe(true);
    expect(
      comfyEndpointKey("http://GPU-HOST:8188/prompt")
    ).toBe("gpu-host:8188");
  });

  it("distinguishes different hosts or ports", () => {
    expect(
      sameComfyEndpoint("http://127.0.0.1:8188", "http://127.0.0.1:8189")
    ).toBe(false);
    expect(
      sameComfyEndpoint("http://a.local:8188", "http://b.local:8188")
    ).toBe(false);
  });
});
