/**
 * Smoke test: rembg CPU cutout on workhorse ComfyUI.
 */
import fs from "fs";
import path from "path";
import os from "os";

const BASE = process.env.WOOSH_COMFY_URL ?? "http://192.168.1.7:8188";
const isolatePath = path.join(
  os.homedir(),
  "Documents",
  "DiffuseCut",
  "projects",
  "character-test-XR2Jau",
  ".diffusecut",
  "scratch",
  "batches",
  "PASLO9cdLIb-p-KyaIZY5",
  "D9hZ0GbOObfpc6JHHOpOQ-character.png"
);

async function uploadImage(filePath, name) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("image", new Blob([buffer]), name);
  form.append("overwrite", "true");
  const res = await fetch(`${BASE}/upload/image`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed ${res.status}`);
  return (await res.json()).name;
}

async function main() {
  if (!fs.existsSync(isolatePath)) {
    throw new Error(`Missing isolate: ${isolatePath}`);
  }
  const uploaded = await uploadImage(isolatePath, "DiffuseCutRembgTest.png");
  console.log("Uploaded", uploaded);

  const prompt = {
    18: { class_type: "LoadImage", inputs: { image: uploaded } },
    22: {
      class_type: "ImageScale",
      inputs: {
        image: ["18", 0],
        upscale_method: "lanczos",
        width: 512,
        height: 768,
        crop: "center",
      },
    },
    40: {
      class_type: "RemBGSession+",
      inputs: { model: "u2net_human_seg: human segmentation", providers: "CPU" },
    },
    41: {
      class_type: "ImageRemoveBackground+",
      inputs: { rembg_session: ["40", 0], image: ["22", 0] },
    },
    9: {
      class_type: "SaveImage",
      inputs: { filename_prefix: "DiffuseCutRembgTest", images: ["41", 0] },
    },
  };

  const clientId = crypto.randomUUID();
  const queued = await fetch(`${BASE}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, client_id: clientId }),
  }).then((r) => r.json());

  const promptId = queued.prompt_id;
  console.log("Queued", promptId);
  const started = Date.now();

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const history = await fetch(`${BASE}/history/${promptId}`).then((r) =>
      r.ok ? r.json() : null
    );
    const entry = history?.[promptId];
    if (entry?.status?.completed) {
      console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s`, entry.outputs?.["9"]?.images);
      return;
    }
    const queue = await fetch(`${BASE}/queue`).then((r) => r.json());
    const running = queue.queue_running?.some((item) => item[1] === promptId);
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] running=${running}`);
  }
  throw new Error("rembg test timed out");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
