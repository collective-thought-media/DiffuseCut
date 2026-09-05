/**
 * DiffuseCut representative full-user E2E eval harness.
 *
 * Usage:
 *   npm run eval:journey
 *   npm run eval:journey -- --runner grokbot --creative path/to/pack.json
 *   npm run eval:journey -- --dry-run
 *   npm run eval:journey -- --skip-export
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { getAppDataDir } from "@/lib/paths/app-paths";
import { BUILTIN_LTX_I2V_TEMPLATE_ID } from "@/lib/db/builtin-template-ids";
import { loadCreativePack, type CreativePack } from "./creative-pack";
import {
  EvalClient,
  flattenBatchOptions,
  pickCompletedOption,
  waitForAssetBatch,
  waitForExportJob,
  waitForRenderJobs,
} from "./eval-client";
import {
  createEmptyReport,
  finalizeReport,
  tryFfprobe,
  writeReportFiles,
  type EvalReport,
  type TimingEntry,
} from "./report";
import {
  initSurfaceResults,
  loadSurfaceChecklist,
  markSurface,
  type SurfaceResult,
} from "./surface-tracker";

interface CliOptions {
  runner: string;
  creativePath: string;
  dryRun: boolean;
  skipExport: boolean;
  modelName?: string;
  skipPlaywright: boolean;
  baseUrl: string;
}

interface CharacterEntity {
  id: string;
  stateId: string;
  frontAngleId: string;
}

interface LocationEntity {
  id: string;
  stateId: string;
  establishingAngleId: string;
  angleIds: string[];
}

interface ShotEntity {
  id: string;
  renderDeep: boolean;
  generatePlaceholder: boolean;
  stillReferenceMode?: string;
}

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = {
    runner: "cursor",
    creativePath: path.join("scripts", "eval", "default-creative-pack.json"),
    dryRun: false,
    skipExport: false,
    skipPlaywright: false,
    baseUrl: process.env.EVAL_BASE_URL ?? "http://localhost:3004",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--runner" && argv[i + 1]) {
      opts.runner = argv[++i]!;
    } else if (arg === "--creative" && argv[i + 1]) {
      opts.creativePath = argv[++i]!;
    } else if (arg === "--model" && argv[i + 1]) {
      opts.modelName = argv[++i];
    } else if (arg === "--base-url" && argv[i + 1]) {
      opts.baseUrl = argv[++i]!;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--skip-export") {
      opts.skipExport = true;
    } else if (arg === "--skip-playwright") {
      opts.skipPlaywright = true;
    }
  }

  return opts;
}

function runDoctor(): { ok: boolean; output: string } {
  const result = spawnSync("npm run doctor", {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, output };
}

async function timePhase<T>(
  report: EvalReport,
  phase: string,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  try {
    return await fn();
  } finally {
    const endedAt = new Date().toISOString();
    const entry: TimingEntry = {
      phase,
      startedAt,
      endedAt,
      durationMs: Date.now() - startMs,
    };
    report.timings.push(entry);
  }
}

async function bootstrapProject(
  client: EvalClient,
  pack: CreativePack,
  surfaces: SurfaceResult[]
): Promise<{
  projectId: string;
  projectName: string;
  characters: CharacterEntity[];
  locations: LocationEntity[];
  shots: ShotEntity[];
}> {
  const projectName = `E2E Eval ${pack.title} ${new Date().toISOString()}`;
  const { project } = await client.post<{ project: { id: string; name: string } }>(
    "/api/projects",
    { name: projectName }
  );

  markSurface(surfaces, "project.dashboard", {
    status: "passed",
    evidence: `Created project ${project.id}`,
  });

  await client.patch(`/api/projects/${project.id}`, {
    logline: pack.logline,
    plot: pack.plot,
    visualStyle: {
      preset: pack.visualStylePreset,
      customSuffix: pack.visualStyleCustomSuffix,
    },
  });

  await client.patch(`/api/projects/${project.id}/render-settings`, {
    renderSettings: {
      referenceAspectRatio: pack.referenceAspectRatio,
    },
  });

  const characters: CharacterEntity[] = [];
  for (const characterDef of pack.characters) {
    const { character } = await client.post<{
      character: { id: string; states?: Array<{ id: string; angles: Array<{ id: string; name: string }> }> };
    }>(`/api/projects/${project.id}/characters`, {
      name: characterDef.name,
      description: characterDef.description,
    });

    const listed = await client.get<{
      characters: Array<{
        id: string;
        states: Array<{ id: string; angles: Array<{ id: string; name: string }> }>;
      }>;
    }>(`/api/projects/${project.id}/characters`);

    const full = listed.characters.find((c) => c.id === character.id)!;
    const state = full.states[0]!;
    await client.patch(
      `/api/projects/${project.id}/characters/${character.id}/states/${state.id}`,
      {
        name: characterDef.state.name,
        lookDescription: characterDef.state.lookDescription,
      }
    );

    let frontAngleId = state.angles[0]?.id;
    const extraAngles = characterDef.state.angles ?? [];
    for (const angleDef of extraAngles) {
      if (state.angles.some((a) => a.name === angleDef.name)) {
        const existing = state.angles.find((a) => a.name === angleDef.name);
        if (existing && angleDef.name.toLowerCase().includes("front")) {
          frontAngleId = existing.id;
        }
        continue;
      }
      const { angle } = await client.post<{ angle: { id: string } }>(
        `/api/projects/${project.id}/characters/${character.id}/states/${state.id}/angles`,
        {
          name: angleDef.name,
          viewDescription: angleDef.viewDescription,
        }
      );
      if (angleDef.name.toLowerCase().includes("front")) {
        frontAngleId = angle.id;
      }
    }

    if (!frontAngleId) {
      throw new Error(`No front angle for character ${characterDef.name}`);
    }

    characters.push({
      id: character.id,
      stateId: state.id,
      frontAngleId,
    });
  }

  markSurface(surfaces, "project.characters.create", {
    status: "passed",
    evidence: `${characters.length} characters`,
  });

  const locations: LocationEntity[] = [];
  for (const locationDef of pack.locations) {
    const { location } = await client.post<{
      location: {
        id: string;
        states: Array<{ id: string; angles: Array<{ id: string; name: string }> }>;
      };
    }>(`/api/projects/${project.id}/locations`, {
      name: locationDef.name,
      description: locationDef.description,
    });

    const state = location.states[0]!;
    await client.patch(
      `/api/projects/${project.id}/locations/${location.id}/states/${state.id}`,
      {
        name: locationDef.state.name,
        lookDescription: locationDef.state.lookDescription,
      }
    );

    const angleIds: string[] = [...state.angles.map((a) => a.id)];
    let establishingAngleId =
      state.angles.find((a) => a.name.toLowerCase().includes("establishing"))?.id ??
      state.angles[0]!.id;

    for (const angleDef of locationDef.state.angles ?? []) {
      if (state.angles.some((a) => a.name === angleDef.name)) continue;
      const { angle } = await client.post<{ angle: { id: string; name: string } }>(
        `/api/projects/${project.id}/locations/${location.id}/states/${state.id}/angles`,
        {
          name: angleDef.name,
          viewDescription: angleDef.viewDescription,
        }
      );
      angleIds.push(angle.id);
    }

    const refreshed = await client.get<{
      locations: Array<{
        id: string;
        states: Array<{ id: string; angles: Array<{ id: string; name: string }> }>;
      }>;
    }>(`/api/projects/${project.id}/locations`);
    const fullLocation = refreshed.locations.find((l) => l.id === location.id)!;
    const refreshedAngles = fullLocation.states[0]!.angles;
    establishingAngleId =
      refreshedAngles.find((a) => a.name.toLowerCase().includes("establishing"))
        ?.id ?? refreshedAngles[0]!.id;

    locations.push({
      id: location.id,
      stateId: state.id,
      establishingAngleId,
      angleIds: refreshedAngles.map((a) => a.id),
    });
  }

  markSurface(surfaces, "project.locations.create", {
    status: "passed",
    evidence: `${locations.length} locations`,
  });

  const shots: ShotEntity[] = [];
  for (const shotDef of pack.shots) {
    const location =
      shotDef.locationIndex !== undefined
        ? locations[shotDef.locationIndex]
        : undefined;
    const character =
      shotDef.characterIndex !== undefined
        ? characters[shotDef.characterIndex]
        : undefined;

    const body: Record<string, unknown> = {
      title: shotDef.title,
      prompt: shotDef.prompt,
    };
    if (location) {
      body.locationId = location.id;
    }
    if (character) {
      body.characterCast = [
        { characterId: character.id, characterStateId: character.stateId },
      ];
    }

    const { shot } = await client.post<{ shot: { id: string } }>(
      `/api/projects/${project.id}/shots`,
      body
    );

    if (location) {
      await client.patch(`/api/projects/${project.id}/shots/${shot.id}`, {
        locationStateId: location.stateId,
        locationAngleId: location.establishingAngleId,
      });
    }

    if (shotDef.stillReferenceMode) {
      await client.patch(`/api/projects/${project.id}/shots/${shot.id}`, {
        renderOverridesJson: JSON.stringify({
          stillReferenceMode: shotDef.stillReferenceMode,
        }),
      });
      markSurface(surfaces, "project.storyboard.integrate", {
        status: "passed",
        evidence: `${shot.id} mode=${shotDef.stillReferenceMode}`,
      });
    }

    shots.push({
      id: shot.id,
      renderDeep: shotDef.renderDeep === true,
      generatePlaceholder: shotDef.generatePlaceholder === true,
      stillReferenceMode: shotDef.stillReferenceMode,
    });
  }

  markSurface(surfaces, "project.storyboard.shots", {
    status: "passed",
    evidence: `${shots.length} shots`,
  });

  const reversed = [...shots].reverse().map((s) => s.id);
  await client.post(`/api/projects/${project.id}/shots/reorder`, {
    orderedIds: reversed,
  });
  await client.post(`/api/projects/${project.id}/shots/reorder`, {
    orderedIds: shots.map((s) => s.id),
  });

  markSurface(surfaces, "project.storyboard.reorder", {
    status: "passed",
    evidence: "Reordered twice and restored",
  });

  return { projectId: project.id, projectName, characters, locations, shots };
}

async function generateCharacterSheet(
  client: EvalClient,
  projectId: string,
  character: CharacterEntity,
  characterId: string
) {
  const view = await client.post<{ batch: { id: string } }>(
    `/api/projects/${projectId}/characters/${characterId}/states/${character.stateId}/angles/${character.frontAngleId}/generate-sheets`,
    { count: 2, replace: true }
  );
  const batchId = view.batch.id;
  const done = await waitForAssetBatch(
    client,
    `/api/projects/${projectId}/characters/${characterId}/states/${character.stateId}/angles/${character.frontAngleId}/sheet-batch`,
    batchId
  );
  const option = pickCompletedOption(flattenBatchOptions(done));
  if (!option) {
    throw new Error(`Character sheet batch ${batchId} produced no completed option`);
  }
  await client.post(
    `/api/projects/${projectId}/characters/${characterId}/states/${character.stateId}/angles/${character.frontAngleId}/select-sheet`,
    { optionId: option.id }
  );
}

async function generateLocationSheet(
  client: EvalClient,
  projectId: string,
  location: LocationEntity,
  locationId: string
) {
  const view = await client.post<{ batch: { id: string } }>(
    `/api/projects/${projectId}/locations/${locationId}/states/${location.stateId}/angles/${location.establishingAngleId}/generate-sheets`,
    { count: 2, replace: true }
  );
  const batchId = view.batch.id;
  const done = await waitForAssetBatch(
    client,
    `/api/projects/${projectId}/locations/${locationId}/states/${location.stateId}/angles/${location.establishingAngleId}/sheet-batch`,
    batchId
  );
  const option = pickCompletedOption(flattenBatchOptions(done));
  if (!option) {
    throw new Error(`Location sheet batch ${batchId} produced no completed option`);
  }
  await client.post(
    `/api/projects/${projectId}/locations/${locationId}/states/${location.stateId}/angles/${location.establishingAngleId}/select-sheet`,
    { optionId: option.id }
  );
}

async function generateShotPlaceholder(
  client: EvalClient,
  projectId: string,
  shotId: string
) {
  const view = await client.post<{ batch: { id: string } }>(
    `/api/projects/${projectId}/shots/${shotId}/generate-placeholders`,
    { count: 2, replace: true }
  );
  const batchId = view.batch.id;
  const done = await waitForAssetBatch(
    client,
    `/api/projects/${projectId}/shots/${shotId}/placeholder-batch`,
    batchId
  );
  const option = pickCompletedOption(flattenBatchOptions(done));
  if (!option) {
    throw new Error(`Shot placeholder batch ${batchId} produced no completed option`);
  }
  await client.post(
    `/api/projects/${projectId}/shots/${shotId}/select-placeholder`,
    { optionId: option.id }
  );
}

function runPlaywrightSurfaces(projectId: string, baseUrl: string) {
  const configPath = path.join(process.cwd(), "playwright.eval.config.ts");
  const result = spawnSync(
    `npx playwright test e2e/eval-surfaces.spec.ts --config=${configPath}`,
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        EVAL_PROJECT_ID: projectId,
        EVAL_BASE_URL: baseUrl,
      },
      encoding: "utf8",
      shell: true,
      stdio: "inherit",
    }
  );
  return result.status === 0;
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  const rootDir = process.cwd();
  const creativePath = path.isAbsolute(opts.creativePath)
    ? opts.creativePath
    : path.join(rootDir, opts.creativePath);
  const pack = loadCreativePack(creativePath);
  const checklist = loadSurfaceChecklist(rootDir);
  const runId = `${opts.runner}-${Date.now()}`;
  const runDir = path.join(getAppDataDir(), "eval-runs", runId);

  const report = createEmptyReport({
    runId,
    runner: opts.runner,
    creativePackPath: creativePath,
    dryRun: opts.dryRun,
    skipExport: opts.skipExport,
    knownGaps: checklist.knownGaps,
    modelName: opts.modelName,
  });

  const surfaces = initSurfaceResults(checklist);
  const client = new EvalClient(opts.baseUrl);

  try {
    await timePhase(report, "preflight", async () => {
      const doctor = runDoctor();
      report.preflight.doctorOk = doctor.ok;
      report.preflight.doctorOutput = doctor.output;

      try {
        await client.get("/api/projects");
        report.preflight.appReachable = true;
      } catch {
        report.preflight.appReachable = false;
        throw new Error(
          `DiffuseCut app not reachable at ${opts.baseUrl}. Start with npm run dev.`
        );
      }
    });

    const entities = await timePhase(report, "bootstrap", async () =>
      bootstrapProject(client, pack, surfaces)
    );

    report.projectId = entities.projectId;
    report.projectName = entities.projectName;

    const stack = await client.get<{
      stack: {
        comfyuiReachable: boolean;
        ipAdapterAvailable: boolean;
        compositingAvailable: boolean;
      };
    }>(`/api/projects/${entities.projectId}/generation-stack`);

    report.preflight.comfyuiReachable = stack.stack.comfyuiReachable;
    report.preflight.ipAdapterAvailable = stack.stack.ipAdapterAvailable;
    report.preflight.compositingAvailable = stack.stack.compositingAvailable;

    markSurface(surfaces, "project.generation-stack", {
      status: "passed",
      evidence: JSON.stringify(stack.stack),
    });

    await client.get(
      `/api/projects/${entities.projectId}/render-settings?hydrate=1&templateId=${BUILTIN_LTX_I2V_TEMPLATE_ID}`
    );
    markSurface(surfaces, "project.render.settings", {
      status: "passed",
      evidence: "Hydrated LTX render settings",
    });

    const storage = await client.get<{ orphanedRenders: { count: number } }>(
      `/api/projects/${entities.projectId}/storage`
    );
    markSurface(surfaces, "project.settings.storage", {
      status: "passed",
      evidence: `orphans=${storage.orphanedRenders.count}`,
    });

    if (opts.dryRun) {
      report.notes.push("Dry run: skipped ComfyUI generation, render, and export.");
      if (!opts.skipPlaywright) {
        const ok = runPlaywrightSurfaces(entities.projectId, opts.baseUrl);
        if (ok) {
          for (const surface of surfaces.filter((s) => s.method === "playwright")) {
            if (surface.status === "pending") {
              markSurface(surfaces, surface.id, { status: "passed", evidence: "playwright eval-surfaces" });
            }
          }
        } else {
          report.errors.push("Playwright eval-surfaces failed");
          for (const surface of surfaces.filter((s) => s.method === "playwright" && s.status === "pending")) {
            markSurface(surfaces, surface.id, { status: "failed", error: "playwright eval-surfaces" });
          }
        }
      }
      finalizeReport(report, surfaces);
      writeReportFiles(runDir, report, pack);
      console.log(`Dry run complete. Report: ${runDir}`);
      return;
    }

    if (!stack.stack.comfyuiReachable) {
      throw new Error("ComfyUI is not reachable. Cannot run deep eval path.");
    }

    await timePhase(report, "character-sheet", async () => {
      const charIndices = new Set<number>();
      for (const shotDef of pack.shots) {
        if (
          (shotDef.generatePlaceholder || shotDef.renderDeep) &&
          shotDef.characterIndex !== undefined
        ) {
          charIndices.add(shotDef.characterIndex);
        }
      }
      if (charIndices.size === 0) charIndices.add(0);

      const generated: string[] = [];
      for (const idx of [...charIndices].sort()) {
        const character = entities.characters[idx];
        if (!character) continue;
        await generateCharacterSheet(
          client,
          entities.projectId,
          character,
          character.id
        );
        generated.push(character.id);
      }
      markSurface(surfaces, "project.characters.generate", {
        status: "passed",
        evidence: `characters=${generated.join(",")}`,
      });
    });

    await timePhase(report, "location-sheet", async () => {
      const loc = entities.locations[0]!;
      await generateLocationSheet(
        client,
        entities.projectId,
        loc,
        loc.id
      );
      markSurface(surfaces, "project.locations.generate", {
        status: "passed",
        evidence: `location=${loc.id}`,
      });
    });

    await timePhase(report, "shot-placeholders", async () => {
      const placeholderShots = entities.shots.filter((s) => s.generatePlaceholder);
      let successCount = 0;
      for (const shot of placeholderShots) {
        try {
          await generateShotPlaceholder(client, entities.projectId, shot.id);
          successCount += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (shot.stillReferenceMode === "integrate_in_scene") {
            report.notes.push(
              `Integrate placeholder failed for shot ${shot.id}: ${message}. Clearing mode and retrying standard placeholder.`
            );
            await client.patch(`/api/projects/${entities.projectId}/shots/${shot.id}`, {
              renderOverridesJson: JSON.stringify({ stillReferenceMode: "auto" }),
            });
            markSurface(surfaces, "project.storyboard.integrate", {
              status: "skipped",
              skipReason: message,
            });
            await generateShotPlaceholder(client, entities.projectId, shot.id);
            successCount += 1;
          } else {
            throw err;
          }
        }
      }
      if (successCount === 0 && placeholderShots.length > 0) {
        throw new Error("No shot placeholders completed");
      }
      markSurface(surfaces, "project.storyboard.placeholder", {
        status: "passed",
        evidence: `${successCount}/${placeholderShots.length} shots`,
      });
    });

    const deepShots = entities.shots.filter((s) => s.renderDeep);
    if (deepShots.length === 0) {
      throw new Error("Creative pack must mark at least one shot with renderDeep: true");
    }

    await timePhase(report, "render", async () => {
      const { jobs } = await client.post<{ jobs: Array<{ id: string }> }>(
        "/api/render-jobs",
        {
          projectId: entities.projectId,
          shotIds: deepShots.map((s) => s.id),
          workflowTemplateId: BUILTIN_LTX_I2V_TEMPLATE_ID,
        }
      );
      const finished = await waitForRenderJobs(
        client,
        entities.projectId,
        jobs.map((j) => j.id)
      );
      const failed = finished.filter((j) => j.status !== "completed");
      if (failed.length > 0) {
        throw new Error(
          `Render jobs failed: ${failed.map((j) => `${j.id}:${j.errorMessage ?? j.status}`).join(", ")}`
        );
      }
      markSurface(surfaces, "project.render.queue", {
        status: "passed",
        evidence: `${finished.length} jobs completed`,
      });
    });

    const trimTarget = deepShots[0]!;
    const trimIn = pack.finishing?.trimInFrames ?? 4;
    await client.patch(`/api/projects/${entities.projectId}/shots/${trimTarget.id}`, {
      trimInFrames: trimIn,
    });
    markSurface(surfaces, "project.finishing.trim", {
      status: "passed",
      evidence: `shot=${trimTarget.id} trimIn=${trimIn}`,
    });

    const overlayText = pack.finishing?.overlayText ?? pack.title;
    await client.put(`/api/projects/${entities.projectId}/overlays`, {
      overlays: [
        {
          text: overlayText,
          startFrame: 0,
          endFrame: 48,
          shotId: null,
        },
      ],
    });
    markSurface(surfaces, "project.finishing.overlays", {
      status: "passed",
      evidence: overlayText,
    });
    report.notes.push(
      "Text overlay saved for Finishing preview only (not burned into export)."
    );

    if (!opts.skipExport) {
      await timePhase(report, "export", async () => {
        const { jobId } = await client.post<{ jobId: string }>("/api/export", {
          projectId: entities.projectId,
          settings: { format: "mp4" },
        });
        const exportJob = await waitForExportJob(client, jobId);
        if (exportJob.status !== "completed" || !exportJob.outputPath) {
          throw new Error(
            exportJob.errorMessage ?? `Export failed: ${exportJob.status}`
          );
        }

        const storageInfo = await client.get<{ projectRoot: string }>(
          `/api/projects/${entities.projectId}/storage`
        );
        const absoluteExport = path.join(
          storageInfo.projectRoot,
          exportJob.outputPath
        );
        report.export.path = absoluteExport;

        if (fs.existsSync(absoluteExport)) {
          const copiedTo = path.join(runDir, path.basename(absoluteExport));
          fs.mkdirSync(runDir, { recursive: true });
          fs.copyFileSync(absoluteExport, copiedTo);
          report.export.copiedTo = copiedTo;
          const probe = await tryFfprobe(copiedTo);
          if (probe.data) report.export.ffprobe = probe.data;
          if (probe.error) report.export.ffprobeError = probe.error;
        }

        markSurface(surfaces, "project.export.queue", {
          status: "passed",
          evidence: exportJob.outputPath,
        });
      });
    } else {
      markSurface(surfaces, "project.export.queue", {
        status: "skipped",
        skipReason: "--skip-export",
      });
    }

    if (!opts.skipPlaywright) {
      const ok = runPlaywrightSurfaces(entities.projectId, opts.baseUrl);
      const playwrightSurfaces = surfaces.filter((s) => s.method === "playwright");
      for (const surface of playwrightSurfaces) {
        if (surface.status !== "pending") continue;
        markSurface(surfaces, surface.id, {
          status: ok ? "passed" : "failed",
          evidence: ok ? "playwright eval-surfaces" : undefined,
          error: ok ? undefined : "playwright eval-surfaces failed",
        });
      }
    }

    finalizeReport(report, surfaces);
    writeReportFiles(runDir, report, pack);
    console.log(`Eval complete. Report: ${runDir}`);
    console.log(
      `Surface coverage: ${report.surfaceCoveragePercent}% (${report.surfacePassRate}% pass rate)`
    );
    if (report.export.copiedTo) {
      console.log(`Export copy: ${report.export.copiedTo}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report.errors.push(message);
    finalizeReport(report, surfaces);
    writeReportFiles(runDir, report, pack);
    console.error(message);
    console.error(`Partial report written to ${runDir}`);
    process.exit(1);
  }
}

main();
