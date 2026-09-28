/**
 * Focused Integrate reliability loop: suburban guy + house plate.
 *
 * Creates an isolated project, generates character + location sheets, then
 * Integrate stills with Subject size medium. Copies completed stills into the
 * eval-runs folder for visual inspection.
 *
 * Usage:
 *   npx tsx scripts/eval/run-integrate-reliability.ts
 *   npx tsx scripts/eval/run-integrate-reliability.ts --rounds 2 --count 3
 */
import fs from "fs";
import path from "path";
import { getAppDataDir, getProjectsDir } from "@/lib/paths/app-paths";
import { loadCreativePack } from "./creative-pack";
import {
  EvalClient,
  flattenBatchOptions,
  pickCompletedOption,
  waitForAssetBatch,
} from "./eval-client";

interface CliOptions {
  baseUrl: string;
  rounds: number;
  count: number;
  subjectScale: "small" | "medium" | "large";
  packPath: string;
}

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = {
    baseUrl: process.env.EVAL_BASE_URL ?? "http://localhost:3004",
    rounds: 1,
    count: 3,
    subjectScale: "medium",
    packPath: path.join("scripts", "eval", "suburban-yard-integrate-pack.json"),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url" && argv[i + 1]) opts.baseUrl = argv[++i]!;
    else if (arg === "--rounds" && argv[i + 1]) opts.rounds = Number(argv[++i]);
    else if (arg === "--count" && argv[i + 1]) opts.count = Number(argv[++i]);
    else if (arg === "--subject-scale" && argv[i + 1]) {
      opts.subjectScale = argv[++i] as CliOptions["subjectScale"];
    } else if (arg === "--pack" && argv[i + 1]) opts.packPath = argv[++i]!;
  }
  return opts;
}

function resolveMediaAbs(projectRoot: string, rel: string | null | undefined): string {
  if (!rel) {
    throw new Error(`Missing media path under ${projectRoot}`);
  }
  return path.join(projectRoot, String(rel).replace(/^[/\\]+/, ""));
}

/**
 * Prefer standing casting sheets over kneel/crouch. Estimates the non-backdrop
 * subject's bounding box aspect (taller is better for Integrate paste scale).
 * Front+back diptych candidates are scored on the left panel only.
 */
async function scoreStandingSheet(absPath: string): Promise<number> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(absPath).metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (fullW < 8 || fullH < 8) return 0;
  // Diptych sheet candidates are wide; score the left (front) panel only.
  const extractWidth = fullW >= fullH * 1.35 ? Math.floor(fullW / 2) : fullW;
  const { data, info } = await sharp(absPath)
    .extract({ left: 0, top: 0, width: extractWidth, height: fullH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      // Studio backdrop is near-gray; subject clothing/skin differs.
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const avg = (r + g + b) / 3;
      const nearGray = chroma < 22 && avg > 70 && avg < 210;
      if (nearGray) continue;
      hits++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (hits < 200 || maxX <= minX || maxY <= minY) return 0;
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const aspect = boxH / Math.max(1, boxW);
  // Prefer taller-than-wide subjects (standing). Mildly penalize very wide
  // crouch/kneel sheets without zeroing every candidate.
  const widthFrac = boxW / width;
  let rank = aspect;
  if (widthFrac > 0.62) rank *= 0.85;
  if (aspect > 1.85) rank = Math.max(0.8, 2.4 - aspect);

  // Kneeling / crouching sheets often still score tall (tight crop) but the
  // lower third of the subject bbox is much wider than the shoulders.
  const band = Math.max(4, Math.floor(boxH / 3));
  const topY0 = minY;
  const topY1 = minY + band;
  const botY0 = maxY - band + 1;
  const botY1 = maxY + 1;
  let topMinX = width;
  let topMaxX = 0;
  let botMinX = width;
  let botMaxX = 0;
  for (let y = topY0; y < topY1; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * width + x) * channels;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const avg = (r + g + b) / 3;
      if (chroma < 22 && avg > 70 && avg < 210) continue;
      if (x < topMinX) topMinX = x;
      if (x > topMaxX) topMaxX = x;
    }
  }
  for (let y = botY0; y < botY1; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * width + x) * channels;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const avg = (r + g + b) / 3;
      if (chroma < 22 && avg > 70 && avg < 210) continue;
      if (x < botMinX) botMinX = x;
      if (x > botMaxX) botMaxX = x;
    }
  }
  if (topMaxX > topMinX && botMaxX > botMinX) {
    const topW = topMaxX - topMinX + 1;
    const botW = botMaxX - botMinX + 1;
    if (botW > topW * 1.28) rank *= 0.55;
  }
  // Prefer sheets that use most of the frame height (full standing figure).
  const heightFrac = boxH / height;
  if (heightFrac < 0.72) rank *= 0.75;
  return rank;
}

async function pickStandingCharacterOption(
  projectRoot: string,
  options: Array<{ id: string; outputPath?: string | null; [key: string]: unknown }>
): Promise<{ id: string; outputPath: string; score: number } | null> {
  let best: { id: string; outputPath: string; score: number } | null = null;
  for (const option of options) {
    const rel = optionOutputPath(option);
    if (!rel) continue;
    const abs = resolveMediaAbs(projectRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const score = await scoreStandingSheet(abs);
    console.log(
      `[integrate-eval] character option ${option.id} standingScore=${score.toFixed(2)}`
    );
    if (!best || score > best.score) {
      best = { id: option.id, outputPath: rel, score };
    }
  }
  return best;
}

function optionOutputPath(option: {
  outputPath?: string | null;
  [key: string]: unknown;
}): string | null {
  const camel = option.outputPath;
  if (typeof camel === "string" && camel.trim()) return camel;
  const snake = option.output_path;
  if (typeof snake === "string" && snake.trim()) return snake;
  return null;
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  const pack = loadCreativePack(opts.packPath);
  const client = new EvalClient(opts.baseUrl);

  const health = await fetch(`${opts.baseUrl}/api/projects`).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `App not reachable at ${opts.baseUrl}. Start with npm run dev first.`
    );
  }

  const runId = `integrate-reliability-${Date.now()}`;
  const outDir = path.join(getAppDataDir(), "eval-runs", runId);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[integrate-eval] output: ${outDir}`);

  const projectName = `Integrate Reliability ${new Date().toISOString()}`;
  const { project } = await client.post<{
    project: { id: string; slug?: string; rootPath?: string | null };
  }>("/api/projects", { name: projectName });
  const projectId = project.id;
  const projectDetails = await client.get<{
    project: { id: string; slug: string; rootPath?: string | null };
  }>(`/api/projects/${projectId}`);
  const projectRoot =
    projectDetails.project.rootPath ||
    path.join(getProjectsDir(), projectDetails.project.slug);
  console.log(`[integrate-eval] project ${projectId}`);
  console.log(`[integrate-eval] root ${projectRoot}`);

  const characterDef = pack.characters[0]!;
  const { character } = await client.post<{
    character: {
      id: string;
      states?: Array<{ id: string; angles: Array<{ id: string; name: string }> }>;
    };
  }>(`/api/projects/${projectId}/characters`, {
    name: characterDef.name,
    description: characterDef.description,
  });
  const { characters } = await client.get<{
    characters: Array<{
      id: string;
      states: Array<{ id: string; angles: Array<{ id: string; name: string }> }>;
    }>;
  }>(`/api/projects/${projectId}/characters`);
  const fullCharacter = characters.find((c) => c.id === character.id)!;
  const charState = fullCharacter.states[0]!;
  await client.patch(
    `/api/projects/${projectId}/characters/${character.id}/states/${charState.id}`,
    {
      name: characterDef.state.name,
      lookDescription: characterDef.state.lookDescription,
    }
  );
  const frontAngle =
    charState.angles.find((a) => /front/i.test(a.name)) ?? charState.angles[0];
  if (!frontAngle) throw new Error("No character front angle");
  // Solo casting portrait (no front+back diptych). Diptych candidates confuse
  // RemBG paste and IP-Adapter, and often land kneeling poses.
  for (const angle of charState.angles) {
    if (angle.id === frontAngle.id) continue;
    await client.delete(
      `/api/projects/${projectId}/characters/${character.id}/states/${charState.id}/angles/${angle.id}`
    );
  }
  const frontView =
    characterDef.state.angles?.[0]?.viewDescription ??
    "Full body front three-quarter standing upright head to toe on both feet";
  await client.patch(
    `/api/projects/${projectId}/characters/${character.id}/states/${charState.id}/angles/${frontAngle.id}`,
    { name: "Front full body", viewDescription: frontView }
  );

  const locationDef = pack.locations[0]!;
  const { location } = await client.post<{
    location: {
      id: string;
      states: Array<{ id: string; angles: Array<{ id: string; name: string }> }>;
    };
  }>(`/api/projects/${projectId}/locations`, {
    name: locationDef.name,
    description: locationDef.description,
  });
  const locState = location.states[0]!;
  await client.patch(
    `/api/projects/${projectId}/locations/${location.id}/states/${locState.id}`,
    {
      name: locationDef.state.name,
      lookDescription: locationDef.state.lookDescription,
    }
  );
  const establishing =
    locState.angles.find((a) => /establish/i.test(a.name)) ?? locState.angles[0];
  if (!establishing) throw new Error("No location establishing angle");
  const establishView =
    locationDef.state.angles?.[0]?.viewDescription ??
    "Wide establishing view of the full house and front lawn, empty architecture plate, no people";
  await client.patch(
    `/api/projects/${projectId}/locations/${location.id}/states/${locState.id}/angles/${establishing.id}`,
    { name: "Establishing wide", viewDescription: establishView }
  );

  console.log("[integrate-eval] generating character sheet...");
  {
    let selected: { id: string; outputPath: string; score: number } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const view = await client.post<{ batch: { id: string } }>(
        `/api/projects/${projectId}/characters/${character.id}/states/${charState.id}/angles/${frontAngle.id}/generate-sheets`,
        { count: 4, replace: true }
      );
      const done = await waitForAssetBatch(
        client,
        `/api/projects/${projectId}/characters/${character.id}/states/${charState.id}/angles/${frontAngle.id}/sheet-batch`,
        view.batch.id
      );
      const options = flattenBatchOptions(done).filter(
        (o) => optionOutputPath(o) != null
      );
      if (options.length === 0) {
        console.error(
          "[integrate-eval] character batch payload",
          JSON.stringify(done, null, 2).slice(0, 4000)
        );
        throw new Error("Character sheet failed");
      }
      selected = await pickStandingCharacterOption(projectRoot, options);
      if (selected && selected.score >= 1.0) break;
      console.log(
        `[integrate-eval] standing score too low (${selected?.score ?? 0}), retry ${attempt}/3`
      );
    }
    if (!selected) throw new Error("Character sheet failed");
    const sheetDest = path.join(outDir, "character-sheet.png");
    fs.copyFileSync(resolveMediaAbs(projectRoot, selected.outputPath), sheetDest);
    console.log(
      `[integrate-eval] character sheet -> ${sheetDest} (standingScore=${selected.score.toFixed(2)})`
    );
    await client.post(
      `/api/projects/${projectId}/characters/${character.id}/states/${charState.id}/angles/${frontAngle.id}/select-sheet`,
      { optionId: selected.id }
    );
  }

  console.log("[integrate-eval] generating location plate...");
  {
    const view = await client.post<{ batch: { id: string } }>(
      `/api/projects/${projectId}/locations/${location.id}/states/${locState.id}/angles/${establishing.id}/generate-sheets`,
      { count: 2, replace: true }
    );
    const done = await waitForAssetBatch(
      client,
      `/api/projects/${projectId}/locations/${location.id}/states/${locState.id}/angles/${establishing.id}/sheet-batch`,
      view.batch.id
    );
    const option = pickCompletedOption(flattenBatchOptions(done));
    const plateRel = option ? optionOutputPath(option) : null;
    if (!option || !plateRel) {
      console.error("[integrate-eval] location batch payload", JSON.stringify(done, null, 2).slice(0, 4000));
      throw new Error("Location plate failed");
    }
    const plateDest = path.join(outDir, "location-plate.png");
    fs.copyFileSync(resolveMediaAbs(projectRoot, plateRel), plateDest);
    console.log(`[integrate-eval] location plate -> ${plateDest}`);
    await client.post(
      `/api/projects/${projectId}/locations/${location.id}/states/${locState.id}/angles/${establishing.id}/select-sheet`,
      { optionId: option.id }
    );
  }

  const shotDef = pack.shots[0]!;
  const { shot } = await client.post<{ shot: { id: string } }>(
    `/api/projects/${projectId}/shots`,
    {
      title: shotDef.title,
      prompt: shotDef.prompt,
      locationId: location.id,
      characterCast: [
        { characterId: character.id, characterStateId: charState.id },
      ],
    }
  );
  await client.patch(`/api/projects/${projectId}/shots/${shot.id}`, {
    locationStateId: locState.id,
    locationAngleId: establishing.id,
    renderOverridesJson: JSON.stringify({
      stillReferenceMode: "integrate_in_scene",
      subjectScale: opts.subjectScale,
      subjectPosition: "center",
      identityStrength: "balanced",
    }),
  });

  const summary: Array<{
    round: number;
    optionId: string;
    outputPath: string;
    copiedTo: string;
  }> = [];

  for (let round = 1; round <= opts.rounds; round++) {
    console.log(
      `[integrate-eval] round ${round}/${opts.rounds}: generate ${opts.count} Integrate stills (scale=${opts.subjectScale})...`
    );
    const view = await client.post<{ batch: { id: string } }>(
      `/api/projects/${projectId}/shots/${shot.id}/generate-placeholders`,
      { count: opts.count, replace: true }
    );
    const done = await waitForAssetBatch(
      client,
      `/api/projects/${projectId}/shots/${shot.id}/placeholder-batch`,
      view.batch.id
    );
    const options = flattenBatchOptions(done).filter(
      (o) => o.status === "completed" && o.outputPath
    );
    if (options.length === 0) {
      throw new Error(`Round ${round}: no completed Integrate options`);
    }
    for (let i = 0; i < options.length; i++) {
      const option = options[i]!;
      const rel = optionOutputPath(option);
      if (!rel) continue;
      const dest = path.join(outDir, `round-${round}-option-${i + 1}.png`);
      fs.copyFileSync(resolveMediaAbs(projectRoot, rel), dest);
      summary.push({
        round,
        optionId: option.id,
        outputPath: rel,
        copiedTo: dest,
      });
      console.log(`[integrate-eval] saved ${dest}`);
    }
    await client.post(
      `/api/projects/${projectId}/shots/${shot.id}/select-placeholder`,
      { optionId: options[0]!.id }
    );
  }

  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        projectId,
        projectName,
        subjectScale: opts.subjectScale,
        profile: "linear integrate + light edge harmonization",
        summary,
      },
      null,
      2
    )
  );
  console.log(`[integrate-eval] done. Inspect stills in ${outDir}`);
  console.log(`[integrate-eval] manifest ${manifestPath}`);
}

main().catch((err) => {
  console.error("[integrate-eval] FAILED", err);
  process.exit(1);
});
