import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import {
  hasAceStepModels,
  type ComfyModelFolders,
} from "@/lib/services/comfyui-workflow-requirements";

export interface ComfyUIPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

export interface ComfyUIHistoryEntry {
  outputs?: Record<
    string,
    {
      images?: { filename: string; subfolder?: string; type?: string }[];
      gifs?: { filename: string; subfolder?: string; type?: string }[];
      videos?: { filename: string; subfolder?: string; type?: string }[];
    }
  >;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: unknown[];
  };
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function toWsUrl(baseUrl: string, clientId?: string): string {
  const normalized = normalizeUrl(baseUrl);
  const wsBase = normalized.replace(/^http/i, "ws");
  const id = clientId ?? randomUUID();
  return `${wsBase}/ws?clientId=${encodeURIComponent(id)}`;
}

export async function healthCheck(baseUrl: string): Promise<boolean> {
  const url = `${normalizeUrl(baseUrl)}/system_stats`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

export async function listEndpoints(endpoints: string[]): Promise<string | null> {
  for (const endpoint of endpoints) {
    const normalized = normalizeUrl(endpoint);
    if (await healthCheck(normalized)) {
      return normalized;
    }
  }
  return null;
}

export const COMFYUI_ANCHOR_REFERENCE_FILENAME = "DiffuseCutAnchorReference.png";
export const COMFYUI_CHARACTER_REFERENCE_FILENAME =
  "DiffuseCutCharacterReference.png";
export const COMFYUI_LOCATION_REFERENCE_FILENAME =
  "DiffuseCutLocationReference.png";

export async function uploadMedia(
  baseUrl: string,
  filePath: string,
  options?: {
    overwrite?: boolean;
    kind?: "image" | "video";
    uploadFileName?: string;
  }
): Promise<{ name: string; subfolder: string; type: string }> {
  const buffer = fs.readFileSync(filePath);
  const fileName = options?.uploadFileName ?? path.basename(filePath);
  const blob = new Blob([buffer]);
  const form = new FormData();
  form.append("image", blob, fileName);
  form.append("overwrite", options?.overwrite ? "true" : "false");
  if (options?.kind === "video") {
    form.append("type", "input");
  }

  const res = await fetch(`${normalizeUrl(baseUrl)}/upload/image`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI upload failed (${res.status}): ${text || res.statusText}`
    );
  }

  const data = (await res.json()) as {
    name: string;
    subfolder?: string;
    type?: string;
  };

  return {
    name: data.name,
    subfolder: data.subfolder ?? "",
    type: data.type ?? "input",
  };
}

export async function verifyInputImage(
  baseUrl: string,
  filename: string,
  subfolder = ""
): Promise<boolean> {
  const params = new URLSearchParams({
    filename,
    subfolder,
    type: "input",
  });

  const res = await fetch(
    `${normalizeUrl(baseUrl)}/view?${params.toString()}`,
    { method: "HEAD" }
  ).catch(() => null);

  if (res?.ok) return true;

  const getRes = await fetch(
    `${normalizeUrl(baseUrl)}/view?${params.toString()}`
  ).catch(() => null);

  return getRes?.ok ?? false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadReferenceImageWithFilename(
  baseUrl: string,
  filePath: string,
  uploadFileName: string,
  label: string
): Promise<string> {
  const uploaded = await uploadMedia(baseUrl, filePath, {
    kind: "image",
    overwrite: true,
    uploadFileName,
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (
      await verifyInputImage(baseUrl, uploaded.name, uploaded.subfolder)
    ) {
      return uploaded.name;
    }
    await sleep(125 * (attempt + 1));
  }

  throw new Error(
    `ComfyUI did not finish storing the ${label} reference image (${uploaded.name}). Try again in a moment.`
  );
}

export async function uploadAnchorReferenceImage(
  baseUrl: string,
  filePath: string
): Promise<string> {
  return uploadReferenceImageWithFilename(
    baseUrl,
    filePath,
    COMFYUI_ANCHOR_REFERENCE_FILENAME,
    "anchor"
  );
}

export async function uploadCharacterReferenceImage(
  baseUrl: string,
  filePath: string
): Promise<string> {
  return uploadReferenceImageWithFilename(
    baseUrl,
    filePath,
    COMFYUI_CHARACTER_REFERENCE_FILENAME,
    "character"
  );
}

export async function uploadLocationReferenceImage(
  baseUrl: string,
  filePath: string
): Promise<string> {
  return uploadReferenceImageWithFilename(
    baseUrl,
    filePath,
    COMFYUI_LOCATION_REFERENCE_FILENAME,
    "location"
  );
}

export async function queuePrompt(
  baseUrl: string,
  workflow: Record<string, unknown>,
  clientId?: string
): Promise<ComfyUIPromptResponse> {
  const payload = {
    prompt: workflow,
    client_id: clientId ?? randomUUID(),
  };

  const res = await fetch(`${normalizeUrl(baseUrl)}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  const { formatComfyuiError } = await import("@/lib/services/comfyui-errors");

  if (!res.ok) {
    throw new Error(
      formatComfyuiError(
        `ComfyUI queue prompt failed (${res.status}): ${text || res.statusText}`
      )
    );
  }

  let data: ComfyUIPromptResponse;
  try {
    data = JSON.parse(text) as ComfyUIPromptResponse;
  } catch {
    throw new Error(formatComfyuiError(text || "ComfyUI queue prompt failed"));
  }

  if (data.node_errors && Object.keys(data.node_errors).length > 0) {
    throw new Error(
      formatComfyuiError(
        `ComfyUI queue prompt failed (400): ${JSON.stringify({
          node_errors: data.node_errors,
        })}`
      )
    );
  }

  return data;
}

export async function getHistory(
  baseUrl: string,
  promptId: string
): Promise<ComfyUIHistoryEntry | null> {
  const res = await fetch(
    `${normalizeUrl(baseUrl)}/history/${encodeURIComponent(promptId)}`
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`ComfyUI history failed (${res.status})`);
  }

  const data = (await res.json()) as Record<string, ComfyUIHistoryEntry>;
  return data[promptId] ?? null;
}

export async function downloadOutput(
  baseUrl: string,
  file: { filename: string; subfolder?: string; type?: string },
  destPath: string
): Promise<string> {
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? "",
    type: file.type ?? "output",
  });

  const res = await fetch(
    `${normalizeUrl(baseUrl)}/view?${params.toString()}`
  );

  if (!res.ok) {
    throw new Error(`ComfyUI download failed (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

export async function getObjectInfo(
  baseUrl: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${normalizeUrl(baseUrl)}/object_info`);
  if (!res.ok) {
    throw new Error(`ComfyUI object_info failed (${res.status})`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function assertComfyuiNodeClasses(
  baseUrl: string,
  classTypes: string[]
): Promise<void> {
  const objectInfo = await getObjectInfo(baseUrl);
  const missing = classTypes.filter((classType) => !(classType in objectInfo));
  if (missing.length === 0) return;

  throw new Error(
    `ComfyUI is missing custom nodes required for this workflow: ${missing.join(", ")}. Install ComfyUI_IPAdapter_plus on your ComfyUI server and restart it. See templates/location-reference/README.md in DiffuseCut.`
  );
}

const ipAdapterAvailabilityCache = new Map<
  string,
  { available: boolean; checkedAt: number }
>();
const IP_ADAPTER_CACHE_MS = 60_000;

export async function isIpAdapterAvailable(baseUrl: string): Promise<boolean> {
  const normalized = normalizeUrl(baseUrl);
  const cached = ipAdapterAvailabilityCache.get(normalized);
  if (cached && Date.now() - cached.checkedAt < IP_ADAPTER_CACHE_MS) {
    return cached.available;
  }

  try {
    const objectInfo = await getObjectInfo(normalized);
    const hasNodes =
      "IPAdapterModelLoader" in objectInfo &&
      "CLIPVisionLoader" in objectInfo &&
      "IPAdapterAdvanced" in objectInfo;
    if (!hasNodes) {
      ipAdapterAvailabilityCache.set(normalized, {
        available: false,
        checkedAt: Date.now(),
      });
      return false;
    }

    const models = await getModels(normalized, "ipadapter");
    const available = models.length > 0;
    ipAdapterAvailabilityCache.set(normalized, {
      available,
      checkedAt: Date.now(),
    });
    return available;
  } catch {
    ipAdapterAvailabilityCache.set(normalized, {
      available: false,
      checkedAt: Date.now(),
    });
    return false;
  }
}

export async function getModels(
  baseUrl: string,
  folder: string
): Promise<string[]> {
  const res = await fetch(
    `${normalizeUrl(baseUrl)}/models/${encodeURIComponent(folder)}`
  );

  if (!res.ok) {
    throw new Error(`ComfyUI models list failed (${res.status})`);
  }

  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) {
    return data.filter((item): item is string => typeof item === "string");
  }

  return [];
}

export interface ComfyUIQueueSnapshot {
  queue_running: unknown[][];
  queue_pending: unknown[][];
}

export async function getQueue(baseUrl: string): Promise<ComfyUIQueueSnapshot> {
  const res = await fetch(`${normalizeUrl(baseUrl)}/queue`);
  if (!res.ok) {
    throw new Error(`ComfyUI queue failed (${res.status})`);
  }
  const data = (await res.json()) as Partial<ComfyUIQueueSnapshot>;
  return {
    queue_running: Array.isArray(data.queue_running) ? data.queue_running : [],
    queue_pending: Array.isArray(data.queue_pending) ? data.queue_pending : [],
  };
}

export function findPromptQueueState(
  queue: ComfyUIQueueSnapshot,
  promptId: string
): "running" | "pending" | "absent" {
  for (const item of queue.queue_running) {
    if (item[1] === promptId) return "running";
  }
  for (const item of queue.queue_pending) {
    if (item[1] === promptId) return "pending";
  }
  return "absent";
}

export function extractOutputFiles(
  entry: ComfyUIHistoryEntry
): { filename: string; subfolder?: string; type?: string }[] {
  const files: { filename: string; subfolder?: string; type?: string }[] = [];
  if (!entry.outputs) return files;

  for (const nodeOutput of Object.values(entry.outputs)) {
    for (const bucket of ["images", "gifs", "videos"] as const) {
      const items = nodeOutput[bucket];
      if (items) files.push(...items);
    }
  }

  return files;
}

export function extractAudioOutputFiles(
  entry: ComfyUIHistoryEntry
): { filename: string; subfolder?: string; type?: string }[] {
  const files: { filename: string; subfolder?: string; type?: string }[] = [];
  if (!entry.outputs) return files;

  for (const nodeOutput of Object.values(entry.outputs)) {
    for (const bucket of ["audio", "audios", "flac", "mp3", "wav"] as const) {
      const items = (nodeOutput as Record<string, unknown>)[bucket];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (
          item &&
          typeof item === "object" &&
          "filename" in item &&
          typeof (item as { filename: unknown }).filename === "string"
        ) {
          const typed = item as {
            filename: string;
            subfolder?: string;
            type?: string;
          };
          files.push({
            filename: typed.filename,
            subfolder: typed.subfolder,
            type: typed.type,
          });
        }
      }
    }
  }

  return files;
}

export async function waitForHistory(
  baseUrl: string,
  promptId: string,
  options?: { timeoutMs?: number; pollMs?: number }
): Promise<ComfyUIHistoryEntry> {
  const timeoutMs = options?.timeoutMs ?? 20 * 60_000;
  const pollMs = options?.pollMs ?? 3000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const entry = await getHistory(baseUrl, promptId);
    if (entry?.status?.completed) {
      return entry;
    }
    if (entry?.outputs && Object.keys(entry.outputs).length > 0) {
      return entry;
    }
    await sleep(pollMs);
  }

  throw new Error(
    `ComfyUI prompt ${promptId} timed out after ${Math.round(timeoutMs / 1000)}s`
  );
}

const aceStepAvailabilityCache = new Map<
  string,
  { available: boolean; checkedAt: number }
>();
const ACE_STEP_CACHE_MS = 60_000;

async function loadAceStepModelFolders(
  baseUrl: string
): Promise<ComfyModelFolders> {
  const [
    checkpoints,
    ipadapter,
    clipVision,
    unet,
    vae,
    diffusionModels,
    textEncoders,
  ] = await Promise.all([
    getModels(baseUrl, "checkpoints"),
    getModels(baseUrl, "ipadapter").catch(() => [] as string[]),
    getModels(baseUrl, "clip_vision").catch(() => [] as string[]),
    getModels(baseUrl, "unet").catch(() => [] as string[]),
    getModels(baseUrl, "vae").catch(() => [] as string[]),
    getModels(baseUrl, "diffusion_models").catch(() => [] as string[]),
    getModels(baseUrl, "text_encoders").catch(() => [] as string[]),
  ]);

  return {
    checkpoints,
    ipadapter,
    clipVision,
    unet,
    vae,
    diffusionModels,
    textEncoders,
  };
}

export async function isAceStepAvailable(baseUrl: string): Promise<boolean> {
  const normalized = normalizeUrl(baseUrl);
  const cached = aceStepAvailabilityCache.get(normalized);
  if (cached && Date.now() - cached.checkedAt < ACE_STEP_CACHE_MS) {
    return cached.available;
  }

  try {
    const objectInfo = await getObjectInfo(normalized);
    const hasNodes =
      "TextEncodeAceStepAudio1.5" in objectInfo &&
      "EmptyAceStep1.5LatentAudio" in objectInfo &&
      "VAEDecodeAudio" in objectInfo;
    if (!hasNodes) {
      aceStepAvailabilityCache.set(normalized, {
        available: false,
        checkedAt: Date.now(),
      });
      return false;
    }

    const models = await loadAceStepModelFolders(normalized);
    const available = hasAceStepModels(models);
    aceStepAvailabilityCache.set(normalized, {
      available,
      checkedAt: Date.now(),
    });
    return available;
  } catch {
    aceStepAvailabilityCache.set(normalized, {
      available: false,
      checkedAt: Date.now(),
    });
    return false;
  }
}
