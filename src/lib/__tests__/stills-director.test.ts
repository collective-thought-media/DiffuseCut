import { describe, expect, it } from "vitest";
import {
  recommendTechnique,
  resolvePromptSent,
  STILL_TECHNIQUE_GUIDE,
} from "@/lib/stills/techniques";
import {
  automatedPass,
  casePass,
  weightedRubricScore,
  type AutomatedStillChecks,
  type VisualGrade,
} from "@/lib/stills/eval-rubric";
import { createFolderImportProvider } from "@/lib/stills/providers";
import fs from "fs";
import os from "os";
import path from "path";

describe("still techniques", () => {
  it("recommends multi_ref_native when identity and set refs exist", () => {
    expect(
      recommendTechnique({
        projectId: "p",
        prompt: "wide desert approach",
        aspectRatio: "16:9",
        refs: [
          { role: "identity", path: "/a.png" },
          { role: "set", path: "/b.png" },
        ],
      })
    ).toBe("multi_ref_native");
  });

  it("does not rewrite prompts when preprocess is off", () => {
    const prompt = "EXACT_PROMPT_TOKEN desert scavenger";
    expect(
      resolvePromptSent({
        projectId: "p",
        prompt,
        aspectRatio: "16:9",
        refs: [],
        allowPromptPreprocess: false,
      })
    ).toBe(prompt);
  });

  it("documents industry techniques without empty guides", () => {
    expect(STILL_TECHNIQUE_GUIDE.length).toBeGreaterThan(5);
    for (const g of STILL_TECHNIQUE_GUIDE) {
      expect(g.industryAnalog.length).toBeGreaterThan(10);
      expect(g.local3090Note.length).toBeGreaterThan(10);
    }
  });
});

describe("still eval rubric", () => {
  it("fails automated checks when harness rewrites the prompt", () => {
    const checks: AutomatedStillChecks = {
      fileExists: true,
      minWidthOk: true,
      minHeightOk: true,
      harnessOffHonored: false,
      errors: ["Harness-off violated"],
    };
    expect(automatedPass(checks)).toBe(false);
  });

  it("requires visual grades above threshold for full pass", () => {
    const checks: AutomatedStillChecks = {
      fileExists: true,
      minWidthOk: true,
      minHeightOk: true,
      harnessOffHonored: true,
      errors: [],
    };
    const weak: VisualGrade = {
      optionId: "x",
      providerId: "folder_import",
      fixtureId: "sandstorm-wide-approach",
      gradedBy: "test",
      gradedAt: new Date().toISOString(),
      scores: [
        { id: "identity_lock", score: 2 },
        { id: "set_continuity", score: 2 },
        { id: "prop_readability", score: 2 },
        { id: "camera_intent", score: 2 },
        { id: "photoreal_grade", score: 2 },
        { id: "no_harness_artifacts", score: 2 },
        { id: "seed_ready_for_i2v", score: 2 },
      ],
    };
    expect(weightedRubricScore(weak.scores)).toBeLessThan(3);
    expect(casePass(checks, weak).pass).toBe(false);
  });
});

describe("folder_import provider", () => {
  it("copies external files into the still inbox", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dc-still-"));
    const src = path.join(tmp, "hero.png");
    // minimal valid 1x1 png
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    fs.writeFileSync(src, png);
    const out = path.join(tmp, "out");
    const provider = createFolderImportProvider();
    const job = await provider.compose(
      {
        projectId: "p",
        prompt: "import test",
        aspectRatio: "16:9",
        refs: [],
        allowPromptPreprocess: false,
        providerOptions: { importPaths: [src] },
      },
      { outputDir: out }
    );
    expect(job.status).toBe("completed");
    expect(job.options).toHaveLength(1);
    expect(fs.existsSync(job.options[0]!.localPath)).toBe(true);
    expect(job.promptSent).toBe("import test");
  });
});
