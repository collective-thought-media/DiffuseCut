import { describe, expect, it } from "vitest";
import { formatComfyuiError } from "@/lib/services/comfyui-errors";

describe("formatComfyuiError", () => {
  it("summarizes missing checkpoint errors", () => {
    const raw = `ComfyUI queue prompt failed (400): {"error":{"type":"prompt_outputs_failed_validation"},"node_errors":{"4":{"errors":[{"type":"value_not_in_list","input_name":"ckpt_name","received_value":"v1-5-pruned-emaonly.safetensors","extra_info":{"input_config":[["RealVisXL_V5.0_fp16.safetensors","realismFusion_v10.safetensors"]]}}]}}}`;

    const message = formatComfyuiError(raw);
    expect(message).toContain("v1-5-pruned-emaonly.safetensors");
    expect(message).toContain("RealVisXL_V5.0_fp16.safetensors");
  });

  it("summarizes invalid anchor image errors", () => {
    const raw = `ComfyUI queue prompt failed (400): {"node_errors":{"10":{"errors":[{"type":"custom_validation_failed","input_name":"image","received_value":"reference.png","message":"Custom validation failed for node: image - Invalid image file: reference.png"}]}}}`;

    const message = formatComfyuiError(raw);
    expect(message).toContain("establishing reference image");
    expect(message).toContain("reference.png");
  });
});
