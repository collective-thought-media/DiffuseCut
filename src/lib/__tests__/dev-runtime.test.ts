import { describe, expect, it } from "vitest";
import {
  isTurbopackManifestRace,
  productionBuildNeedsRebuild,
  shouldEnableTurbopack,
} from "../../../scripts/dev-runtime.mjs";

describe("shouldEnableTurbopack", () => {
  it("stays off for production start", () => {
    expect(
      shouldEnableTurbopack({
        isProd: true,
        argv: ["--turbo"],
        env: { DIFFUSECUT_TURBO: "1" },
      })
    ).toBe(false);
  });

  it("stays off for default developer mode", () => {
    expect(
      shouldEnableTurbopack({ isProd: false, argv: [], env: {} })
    ).toBe(false);
  });

  it("turns on only when asked", () => {
    expect(
      shouldEnableTurbopack({ isProd: false, argv: ["--turbo"], env: {} })
    ).toBe(true);
    expect(
      shouldEnableTurbopack({
        isProd: false,
        argv: [],
        env: { DIFFUSECUT_TURBO: "1" },
      })
    ).toBe(true);
  });
});

describe("isTurbopackManifestRace", () => {
  it("matches the Windows tmp-manifest crash that blanks every page", () => {
    expect(
      isTurbopackManifestRace(
        "Error: ENOENT: no such file or directory, open 'G:\\\\repo\\\\.next\\\\static\\\\development\\\\_buildManifest.js.tmp.abc'"
      )
    ).toBe(true);
  });

  it("ignores unrelated compile noise", () => {
    expect(isTurbopackManifestRace("✓ Compiled /projects/[projectId]/finishing")).toBe(
      false
    );
  });
});

describe("productionBuildNeedsRebuild", () => {
  it("rebuilds when there is no production build yet", () => {
    expect(
      productionBuildNeedsRebuild({
        hasBuild: false,
        builtRev: "",
        currentRev: "abc",
      })
    ).toBe(true);
  });

  it("rebuilds after git pull when the last build is from an older commit", () => {
    expect(
      productionBuildNeedsRebuild({
        hasBuild: true,
        builtRev: "old",
        currentRev: "new",
      })
    ).toBe(true);
  });

  it("skips rebuild when this commit was already built", () => {
    expect(
      productionBuildNeedsRebuild({
        hasBuild: true,
        builtRev: "abc",
        currentRev: "abc",
      })
    ).toBe(false);
  });
});
