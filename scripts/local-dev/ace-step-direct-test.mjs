/**
 * ACE-Step direct test against a local ComfyUI endpoint.
 * Usage: node scripts/local-dev/ace-step-direct-test.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BASE_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";

const CHECKPOINT = "ace_step_1.5_turbo_aio.safetensors";
const DURATION_SEC = 60;
const SEED = 77001422;
const BPM = 72;

// Control Gate pattern: all structure in tags, lyrics empty for instrumentals.
const TAGS =
  "cinematic orchestral score, epic hybrid trailer, dark tense ominous slow burn, " +
  "low brass swell, staccato strings, legato strings, sub drone, taiko drums, " +
  "field recording rain, wind texture, redemption arc rising dynamics, " +
  "heavenly choir pad bright strings outro, instrumental only, no vocals, " +
  "no singing, no lyrics, wide stereo, hi-fi, continuous energy throughout";

const LYRICS = "";
const KEY = "D minor";

function buildWorkflow(filenamePrefix) {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: CHECKPOINT },
    },
    "2": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 3.0 },
    },
    "3": {
      class_type: "TextEncodeAceStepAudio1.5",
      inputs: {
        clip: ["1", 1],
        tags: TAGS,
        lyrics: LYRICS,
        seed: SEED,
        bpm: BPM,
        duration: DURATION_SEC,
        timesignature: "4",
        language: "en",
        keyscale: KEY,
        generate_audio_codes: true,
        cfg_scale: 1.0,
        temperature: 0.0,
        top_p: 1.0,
        top_k: 0,
        min_p: 0.0,
      },
    },
    "4": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["3", 0] },
    },
    "5": {
      class_type: "EmptyAceStep1.5LatentAudio",
      inputs: { seconds: DURATION_SEC, batch_size: 1 },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed: SEED,
        steps: 8,
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
        model: ["2", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
      },
    },
    "7": {
      class_type: "VAEDecodeAudio",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
    },
    "8": {
      class_type: "SaveAudioMP3",
      inputs: {
        audio: ["7", 0],
        filename_prefix: filenamePrefix,
        quality: "320k",
      },
    },
  };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function queuePrompt(workflow) {
  const res = await fetch(`${BASE_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Queue failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function waitForHistory(promptId, timeoutMs = 600_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${BASE_URL}/history/${promptId}`);
    if (!res.ok) throw new Error(`History failed (${res.status})`);
    const data = await res.json();
    const entry = data[promptId];
    if (entry?.status?.completed || entry?.outputs) return entry;
    await sleep(3000);
  }
  throw new Error("Timed out waiting for ACE-Step");
}

function extractAudio(entry) {
  const files = [];
  for (const nodeOutput of Object.values(entry.outputs ?? {})) {
    for (const key of ["audio", "audios", "mp3", "wav", "flac"]) {
      const items = nodeOutput[key];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item?.filename) files.push(item);
      }
    }
  }
  return files;
}

async function downloadAudio(file, destPath) {
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? "",
    type: file.type ?? "output",
  });
  const res = await fetch(`${BASE_URL}/view?${params}`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}

async function main() {
  const outDir = path.join(ROOT, "scratch", "ace-step-direct-test");
  fs.mkdirSync(outDir, { recursive: true });

  const meta = {
    baseUrl: BASE_URL,
    settings: "Control Gate proven: generate_audio_codes=true, temperature=0, lyrics empty",
    tags: TAGS,
    lyrics: LYRICS,
    bpm: BPM,
    keyscale: KEY,
    durationSec: DURATION_SEC,
    seed: SEED,
  };
  fs.writeFileSync(
    path.join(outDir, "control-gate-style-prompt.json"),
    JSON.stringify(meta, null, 2)
  );

  console.log("Queueing Control Gate style ACE-Step test...");
  const prefix = `diffusecut_cg_style_${Date.now()}`;
  const queued = await queuePrompt(buildWorkflow(prefix));
  console.log("prompt_id:", queued.prompt_id);

  const history = await waitForHistory(queued.prompt_id);
  const audioFiles = extractAudio(history);
  if (audioFiles.length === 0) throw new Error("No audio output");

  const dest = path.join(outDir, "control-gate-style-orchestral.mp3");
  await downloadAudio(audioFiles[0], dest);
  console.log("Saved:", dest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
