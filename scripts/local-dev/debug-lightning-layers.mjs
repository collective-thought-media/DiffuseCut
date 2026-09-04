/**
 * Debug lightning SFX layers (keeps all intermediate files).
 * Usage: node scripts/local-dev/debug-lightning-layers.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
process.chdir(ROOT);

const SCRATCH = path.join(ROOT, "scratch", "lightning-debug-" + Date.now());
fs.mkdirSync(SCRATCH, { recursive: true });

const { resolveSfxGenerationPrompt } = await import(
  "../../src/lib/services/resolve-sfx-generation-prompt.ts"
);
const { generateComfyWooshSfxFile, resolveComfyWooshEndpoint } = await import(
  "../../src/lib/services/comfy-woosh-generation.ts"
);
const {
  compositeStrikeOverBed,
  prepareImpulseStrikeClip,
  fitAudioToDuration,
} = await import("../../src/lib/services/audio-score-generation.ts");
const { getDb, schema } = await import("../../src/lib/db/index.ts");
const { eq, asc } = await import("drizzle-orm");

const TRACK_ID = "uUJuZxlzAftsU4y6jsfo_";
const PROJECT_ID = "FpszjyqoP6T4V5NUzFW4A";

const db = getDb();
const track = db
  .select()
  .from(schema.audioTracks)
  .where(eq(schema.audioTracks.id, TRACK_ID))
  .get();
const shots = db
  .select()
  .from(schema.shots)
  .where(eq(schema.shots.projectId, PROJECT_ID))
  .orderBy(asc(schema.shots.sortOrder))
  .all();

const resolved = resolveSfxGenerationPrompt({ track, shots });
console.log(JSON.stringify(resolved, null, 2));

const wooshUrl = await resolveComfyWooshEndpoint();
if (!wooshUrl) throw new Error("No Woosh endpoint");

const strikeRaw = path.join(SCRATCH, "1-strike-raw.mp3");
const strikePrep = path.join(SCRATCH, "2-strike-prepared.mp3");
const bed = path.join(SCRATCH, "3-bed.mp3");
const mixed = path.join(SCRATCH, "4-mixed.mp3");
const final = path.join(SCRATCH, "5-final.m4a");

console.log("Generating strike raw...");
await generateComfyWooshSfxFile({
  baseUrl: wooshUrl,
  prompt: resolved.strikeModelPrompt,
  promptIsFinal: true,
  durationSeconds: 1.5,
  outputAbsolutePath: strikeRaw,
});

console.log("Preparing strike clip...");
await prepareImpulseStrikeClip(strikeRaw, strikePrep, 1.5);

console.log("Generating bed...");
await generateComfyWooshSfxFile({
  baseUrl: wooshUrl,
  prompt: resolved.bedModelPrompt,
  promptIsFinal: true,
  durationSeconds: 3,
  outputAbsolutePath: bed,
});

console.log("Compositing...");
await compositeStrikeOverBed(strikePrep, bed, mixed, 3);
await fitAudioToDuration(mixed, final, 3);

function vol(file) {
  const out = execSync(
    `ffmpeg -hide_banner -i "${file}" -af volumedetect -f null - 2>&1`,
    { encoding: "utf8" }
  );
  const max = out.match(/max_volume: ([^\n]+)/)?.[1] ?? "?";
  const mean = out.match(/mean_volume: ([^\n]+)/)?.[1] ?? "?";
  return { max, mean };
}

for (const file of [strikeRaw, strikePrep, bed, mixed, final]) {
  const { max, mean } = vol(file);
  console.log(`${path.basename(file)}: max=${max} mean=${mean}`);
}

console.log("Saved layers in:", SCRATCH);
