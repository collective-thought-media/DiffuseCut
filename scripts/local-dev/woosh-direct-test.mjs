/**
 * Independent ComfyUI-Woosh SFX test (no DiffuseCut app).
 * Usage: node scripts/local-dev/woosh-direct-test.mjs
 *
 * Env:
 *   WOOSH_COMFY_URL  default http://127.0.0.1:8188
 *   WOOSH_PROMPT     text prompt
 *   WOOSH_FRAMES     latent_frames (100 frames ~ 1s)
 *   WOOSH_SEED       optional seed
 *   WOOSH_OUT        output filename under scratch/woosh-direct-test/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BASE_URL = process.env.WOOSH_COMFY_URL ?? "http://127.0.0.1:8188";
const PROMPT =
  process.env.WOOSH_PROMPT ??
  "fast UI swoosh, short whoosh transition, clean digital";
const LATENT_FRAMES = Number(process.env.WOOSH_FRAMES ?? 201);
const SEED = Number(process.env.WOOSH_SEED ?? 424242);
const OUT_NAME = process.env.WOOSH_OUT ?? "woosh-sfx-test.mp3";

function buildWorkflow(prefix) {
  return {
    "1": {
      class_type: "WooshLoadFlow",
      inputs: { model_name: "Woosh-DFlow", model_type: "DFlow" },
    },
    "3": {
      class_type: "WooshSample",
      inputs: {
        gen_model: ["1", 0],
        prompt: PROMPT,
        steps: 4,
        cfg: 3.5,
        seed: SEED,
        latent_frames: LATENT_FRAMES,
        subprocess: true,
        force_offload: false,
      },
    },
    "4": {
      class_type: "SaveAudioMP3",
      inputs: {
        audio: ["3", 1],
        filename_prefix: prefix,
        quality: "320k",
      },
    },
  };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function extractError(history) {
  const messages = history?.status?.messages ?? [];
  for (const entry of messages) {
    if (Array.isArray(entry) && entry[0] === "execution_error") {
      return entry[1]?.exception_message ?? JSON.stringify(entry[1]);
    }
  }
  return null;
}

async function main() {
  const outDir = path.join(ROOT, "scratch", "woosh-direct-test");
  fs.mkdirSync(outDir, { recursive: true });

  const statsRes = await fetch(`${BASE_URL}/system_stats`);
  if (!statsRes.ok) throw new Error(`Comfy unreachable (${statsRes.status})`);

  const infoRes = await fetch(`${BASE_URL}/object_info`);
  const info = await infoRes.json();
  for (const node of ["WooshLoadFlow", "WooshSample"]) {
    if (!(node in info)) throw new Error(`Missing node ${node} at ${BASE_URL}`);
    console.log("node ok:", node);
  }

  const wooshModels = await fetch(`${BASE_URL}/models/woosh`).then((r) =>
    r.json()
  );
  const hasDflow = wooshModels.some((name) => /Woosh-DFlow/i.test(name));
  if (!hasDflow) {
    throw new Error(`Woosh-DFlow missing at ${BASE_URL}/models/woosh`);
  }
  console.log("woosh models ok (Woosh-DFlow present)");

  const prefix = `diffusecut_woosh_test_${Date.now()}`;
  const workflow = buildWorkflow(prefix);
  fs.writeFileSync(
    path.join(outDir, "workflow.json"),
    JSON.stringify({ baseUrl: BASE_URL, prompt: PROMPT, workflow }, null, 2)
  );

  console.log("Queueing Woosh test at", BASE_URL);
  console.log("Prompt:", PROMPT);
  console.log("Frames:", LATENT_FRAMES, "Seed:", SEED);

  const queueRes = await fetch(`${BASE_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  const queueText = await queueRes.text();
  if (!queueRes.ok) throw new Error(`Queue failed (${queueRes.status}): ${queueText}`);
  const queued = JSON.parse(queueText);
  console.log("prompt_id:", queued.prompt_id);

  const started = Date.now();
  let history = null;
  while (Date.now() - started < 15 * 60_000) {
    const histRes = await fetch(`${BASE_URL}/history/${queued.prompt_id}`);
    const histData = await histRes.json();
    history = histData[queued.prompt_id];
    const err = extractError(history);
    if (err) {
      fs.writeFileSync(
        path.join(outDir, "history-error.json"),
        JSON.stringify(history, null, 2)
      );
      throw new Error(`Woosh job error: ${err.trim()}`);
    }
    if (history?.status?.completed || history?.outputs) {
      const files = [];
      for (const nodeOutput of Object.values(history.outputs ?? {})) {
        for (const bucket of ["audio", "audios", "mp3", "wav", "flac"]) {
          const items = nodeOutput[bucket];
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            if (item?.filename) files.push(item);
          }
        }
      }
      if (files.length > 0) {
        const file = files[0];
        const params = new URLSearchParams({
          filename: file.filename,
          subfolder: file.subfolder ?? "",
          type: file.type ?? "output",
        });
        const audioRes = await fetch(`${BASE_URL}/view?${params}`);
        if (!audioRes.ok) throw new Error(`Download failed (${audioRes.status})`);
        const buf = Buffer.from(await audioRes.arrayBuffer());
        const dest = path.join(outDir, OUT_NAME);
        fs.writeFileSync(dest, buf);
        console.log(
          "Saved:",
          dest,
          `(${(buf.length / 1024).toFixed(1)} KB, ${((Date.now() - started) / 1000).toFixed(1)}s)`
        );
        console.log("provider: woosh_comfy");
        return;
      }
    }
    await sleep(3000);
  }
  throw new Error("Timed out waiting for Woosh");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
