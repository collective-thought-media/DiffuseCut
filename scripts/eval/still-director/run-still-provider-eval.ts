/**
 * Still Director self-eval runner.
 *
 * Usage:
 *   npx tsx scripts/eval/still-director/run-still-provider-eval.ts
 *   npx tsx scripts/eval/still-director/run-still-provider-eval.ts --provider folder_import
 *   npx tsx scripts/eval/still-director/run-still-provider-eval.ts --grade path/to/grades.json
 *
 * Without live API keys this still validates:
 *   - fixture loading
 *   - harness-off prompt integrity (via a mock / folder_import path)
 *   - rubric aggregation
 *
 * Live provider runs attach outputs and automated image probes. Visual grades
 * are separate JSON so humans or agents can score offline.
 */
import fs from "fs";
import path from "path";
import os from "os";
import {
  buildStillProviderRegistry,
  pickProvider,
  type StillBrief,
  type StillRef,
} from "@/lib/stills";
import {
  casePass,
  STILL_RUBRIC,
  type StillEvalCaseResult,
  type VisualGrade,
} from "@/lib/stills/eval-rubric";
import {
  listFixtureFiles,
  loadFixture,
  runAutomatedStillChecks,
  type StillEvalFixture,
} from "@/lib/stills/eval-metrics";

interface Cli {
  provider: string;
  fixturesDir: string;
  outDir: string;
  gradePath?: string;
  importDir?: string;
}

function parseCli(argv: string[]): Cli {
  const cli: Cli = {
    provider: "folder_import",
    fixturesDir: path.join("scripts", "eval", "still-director", "fixtures"),
    outDir: path.join("scripts", "eval", "still-director", "runs"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider" && argv[i + 1]) cli.provider = argv[++i]!;
    else if (a === "--fixtures" && argv[i + 1]) cli.fixturesDir = argv[++i]!;
    else if (a === "--out" && argv[i + 1]) cli.outDir = argv[++i]!;
    else if (a === "--grade" && argv[i + 1]) cli.gradePath = argv[++i]!;
    else if (a === "--import-dir" && argv[i + 1]) cli.importDir = argv[++i]!;
  }
  return cli;
}

function resolveRefs(
  fixture: StillEvalFixture,
  fixtureDir: string
): StillRef[] {
  const refs: StillRef[] = [...(fixture.brief.refs ?? [])];
  const files = fixture.refFiles ?? {};
  for (const role of ["identity", "set", "prop"] as const) {
    const rel = files[role];
    if (!rel) continue;
    const abs = path.resolve(fixtureDir, rel);
    if (!fs.existsSync(abs)) continue;
    refs.push({ role, path: abs, label: rel });
  }
  return refs;
}

function loadGrades(gradePath?: string): VisualGrade[] {
  if (!gradePath || !fs.existsSync(gradePath)) return [];
  const raw = JSON.parse(fs.readFileSync(gradePath, "utf8")) as {
    grades?: VisualGrade[];
  };
  return raw.grades ?? (Array.isArray(raw) ? (raw as VisualGrade[]) : []);
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  const runId = `still-eval-${Date.now()}`;
  const runDir = path.join(cli.outDir, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const registry = buildStillProviderRegistry({
    googleAiApiKey: process.env.GOOGLE_AI_API_KEY,
    falApiKey: process.env.FAL_KEY ?? process.env.FAL_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    replicateApiKey: process.env.REPLICATE_API_TOKEN,
    nightCafeApiKey: process.env.NIGHTCAFE_API_KEY,
    midjourneyRelayUrl: process.env.MIDJOURNEY_RELAY_URL,
    midjourneyApiKey: process.env.MIDJOURNEY_API_KEY,
    comfyEndpointUrl:
      process.env.COMFYUI_URL ?? process.env.DIFFUSECUT_COMFYUI_URL,
  });

  const provider = pickProvider(registry, cli.provider);
  if (!provider) {
    throw new Error(`Unknown provider: ${cli.provider}`);
  }

  const available = await provider.isAvailable();
  const grades = loadGrades(cli.gradePath);
  const fixtureFiles = listFixtureFiles(cli.fixturesDir);
  const results: StillEvalCaseResult[] = [];

  console.log(`[still-eval] provider=${provider.capabilities.id} available=${available}`);
  console.log(`[still-eval] fixtures=${fixtureFiles.length} runDir=${runDir}`);
  console.log("[still-eval] rubric dimensions:");
  for (const d of STILL_RUBRIC) {
    console.log(`  - ${d.id}: ${d.label}`);
  }

  for (const file of fixtureFiles) {
    const fixture = loadFixture(file);
    const fixtureDir = path.dirname(file);
    const brief: StillBrief = {
      ...fixture.brief,
      projectId: fixture.brief.projectId ?? "eval",
      refs: resolveRefs(fixture, fixtureDir),
      allowPromptPreprocess: fixture.brief.allowPromptPreprocess ?? false,
    };

    const caseOut = path.join(runDir, fixture.id);
    fs.mkdirSync(caseOut, { recursive: true });

    // folder_import convenience: pull any png/jpg from --import-dir for this fixture
    if (
      provider.capabilities.id === "folder_import" &&
      cli.importDir &&
      fs.existsSync(cli.importDir)
    ) {
      const imports = fs
        .readdirSync(cli.importDir)
        .filter((n) => /\.(png|jpe?g|webp)$/i.test(n))
        .filter((n) => n.includes(fixture.id) || n.startsWith(fixture.id))
        .map((n) => path.join(cli.importDir!, n));
      if (imports.length) {
        brief.providerOptions = {
          ...(brief.providerOptions ?? {}),
          importPaths: imports,
        };
      }
    }

    // Harness-off smoke does not need an image: synthesize promptSent check only.
    if (fixture.id === "harness-off-smoke") {
      const promptSent = brief.prompt;
      const automated = await runAutomatedStillChecks({
        brief,
        promptSent,
        outputPath: undefined,
      });
      // For smoke, missing image is expected; strip that error for this fixture.
      automated.errors = automated.errors.filter(
        (e) => e !== "Output image missing."
      );
      automated.fileExists = true;
      automated.minWidthOk = true;
      automated.minHeightOk = true;
      const visual = grades.find(
        (g) => g.fixtureId === fixture.id && g.providerId === provider.capabilities.id
      );
      const { pass, weightedScore } = casePass(automated, visual);
      // harness smoke passes on automated alone
      const smokePass = automated.harnessOffHonored && automated.errors.length === 0;
      results.push({
        fixtureId: fixture.id,
        providerId: provider.capabilities.id,
        automated,
        visual,
        weightedScore,
        pass: smokePass,
      });
      console.log(
        `[still-eval] ${fixture.id}: ${smokePass ? "PASS" : "FAIL"} (harness-off smoke)`
      );
      continue;
    }

    if (!available && provider.capabilities.kind !== "import") {
      results.push({
        fixtureId: fixture.id,
        providerId: provider.capabilities.id,
        automated: {
          fileExists: false,
          minWidthOk: false,
          minHeightOk: false,
          harnessOffHonored: true,
          errors: [`Provider ${provider.capabilities.id} not available (missing key or endpoint).`],
        },
        pass: false,
      });
      console.log(`[still-eval] ${fixture.id}: SKIP (provider unavailable)`);
      continue;
    }

    const job = await provider.compose(brief, { outputDir: caseOut });
    const first = job.options[0];
    const automated = await runAutomatedStillChecks({
      brief,
      promptSent: job.promptSent,
      outputPath: first?.localPath,
    });
    if (job.status === "failed") {
      automated.errors.push(job.errorMessage ?? "compose failed");
    }
    const visual = grades.find(
      (g) =>
        g.fixtureId === fixture.id &&
        g.providerId === provider.capabilities.id &&
        (!first || g.optionId === first.id || g.optionId === "*")
    );
    const { pass, weightedScore } = casePass(automated, visual);
    results.push({
      fixtureId: fixture.id,
      providerId: provider.capabilities.id,
      optionId: first?.id,
      automated,
      visual,
      weightedScore,
      pass,
    });
    console.log(
      `[still-eval] ${fixture.id}: ${pass ? "PASS" : "FAIL"} status=${job.status}`
    );
  }

  const report = {
    runId,
    host: os.hostname(),
    provider: provider.capabilities,
    startedAt: new Date().toISOString(),
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
    },
  };
  const reportPath = path.join(runDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[still-eval] wrote ${reportPath}`);
  console.log(
    `[still-eval] summary ${report.summary.passed}/${report.summary.total} passed`
  );

  // harness-off smoke must always pass; treat as hard gate for exit code
  const smoke = results.find((r) => r.fixtureId === "harness-off-smoke");
  if (smoke && !smoke.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
