import { describe, expect, it } from "vitest";
import {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  BUILTIN_KREA2_STILL_TEMPLATE_ID,
  resolveTemplateImageEngine,
  resolveTemplateImageHints,
} from "@/lib/db/builtin-template-ids";

describe("resolveTemplateImageHints", () => {
  it("returns Krea hints for the built-in Krea still template", () => {
    expect(resolveTemplateImageHints(BUILTIN_KREA2_STILL_TEMPLATE_ID)).toEqual([
      "krea2",
      "krea",
      "turbo",
    ]);
  });

  it("returns empty hints for SDXL character sheet template", () => {
    expect(resolveTemplateImageHints(BUILTIN_CHARACTER_SHEET_TEMPLATE_ID)).toEqual(
      []
    );
  });

  it("resolves image engine from template id", () => {
    expect(resolveTemplateImageEngine(BUILTIN_KREA2_STILL_TEMPLATE_ID)).toBe(
      "krea2"
    );
    expect(resolveTemplateImageEngine(BUILTIN_CHARACTER_SHEET_TEMPLATE_ID)).toBe(
      "sdxl"
    );
  });
});
