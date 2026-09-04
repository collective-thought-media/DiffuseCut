import { describe, expect, it } from "vitest";
import { DEFAULT_ACE_STEP_INSTALL_DIR } from "@/lib/services/ace-step-install";

describe("ace-step-install", () => {
  it("uses a LocalAppData default install path", () => {
    expect(DEFAULT_ACE_STEP_INSTALL_DIR).toContain("DiffuseCut");
    expect(DEFAULT_ACE_STEP_INSTALL_DIR).toContain("ACE-Step-1.5");
  });
});
