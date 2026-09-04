import { describe, expect, it } from "vitest";
import {
  BUILTIN_LTX_I2V_TEMPLATE_ID,
  BUILTIN_MINIMAX_I2V_TEMPLATE_ID,
  resolveTemplateVideoHints,
} from "@/lib/db/builtin-template-ids";

describe("resolveTemplateVideoHints", () => {
  it("returns LTX hints for LTX builtin", () => {
    expect(resolveTemplateVideoHints(BUILTIN_LTX_I2V_TEMPLATE_ID)).toEqual([
      "ltx",
    ]);
  });

  it("returns MiniMax hints for MiniMax builtin", () => {
    expect(resolveTemplateVideoHints(BUILTIN_MINIMAX_I2V_TEMPLATE_ID)).toEqual([
      "minimax",
      "h3",
      "fl2va",
    ]);
  });

  it("returns broad hints for custom templates", () => {
    expect(resolveTemplateVideoHints("custom-workflow")).toEqual([
      "ltx",
      "minimax",
    ]);
  });
});
