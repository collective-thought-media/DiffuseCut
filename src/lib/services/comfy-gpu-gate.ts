import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  getQueue,
  normalizeUrl,
} from "@/lib/services/comfyui-client";
import {
  getAceStepRemoteUrlSetting,
  getAceStepComputeModeSetting,
} from "@/lib/services/ace-step-compute";
import { getDefaultComfyuiEndpoints } from "@/lib/services/settings";

const LEASE_SETTING_KEY = "comfy_gpu_lease";
const DEFAULT_WAIT_TIMEOUT_MS = 90 * 60_000;
const DEFAULT_POLL_MS = 2500;
const DEFAULT_LEASE_TTL_MS = 45 * 60_000;

export type ComfyGpuLease = {
  holder: string;
  reason: string;
  comfyBaseUrl: string;
  expiresAt: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compare Comfy endpoints by host+port so http://x:8188/ and http://x:8188 match. */
export function comfyEndpointKey(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    return `${parsed.hostname.toLowerCase()}:${parsed.port || "80"}`;
  } catch {
    return normalizeUrl(url).toLowerCase();
  }
}

export function sameComfyEndpoint(a: string, b: string): boolean {
  return comfyEndpointKey(a) === comfyEndpointKey(b);
}

function readLease(): ComfyGpuLease | null {
  // Sync path via getDb for worker; settings helpers are async wrappers on the same table.
  const db = getDb();
  const row = db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, LEASE_SETTING_KEY))
    .get();
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as ComfyGpuLease;
    if (
      !parsed?.holder ||
      !parsed?.comfyBaseUrl ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLease(lease: ComfyGpuLease | null): void {
  const db = getDb();
  if (!lease) {
    db.delete(schema.appSettings)
      .where(eq(schema.appSettings.key, LEASE_SETTING_KEY))
      .run();
    return;
  }
  db.insert(schema.appSettings)
    .values({ key: LEASE_SETTING_KEY, value: JSON.stringify(lease) })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: JSON.stringify(lease) },
    })
    .run();
}

export function getActiveComfyGpuLease(
  comfyBaseUrl?: string
): ComfyGpuLease | null {
  const lease = readLease();
  if (!lease) return null;
  if (lease.expiresAt <= Date.now()) {
    writeLease(null);
    return null;
  }
  if (comfyBaseUrl && !sameComfyEndpoint(lease.comfyBaseUrl, comfyBaseUrl)) {
    return null;
  }
  return lease;
}

/** True when another DiffuseCut feature holds the shared GPU for this Comfy host. */
export function isComfyGpuLeaseBlocking(
  comfyBaseUrl: string,
  exceptHolder?: string
): boolean {
  const lease = getActiveComfyGpuLease(comfyBaseUrl);
  if (!lease) return false;
  if (exceptHolder && lease.holder === exceptHolder) return false;
  return true;
}

export function releaseComfyGpuLease(holder: string): void {
  const lease = readLease();
  if (!lease) return;
  if (lease.holder !== holder) return;
  writeLease(null);
}

function countActiveDiffuseCutJobs(comfyBaseUrl: string): {
  renders: number;
  assets: number;
} {
  const db = getDb();
  const renders = db
    .select()
    .from(schema.renderJobs)
    .all()
    .filter(
      (job) =>
        (job.status === "queued" || job.status === "running") &&
        sameComfyEndpoint(job.comfyuiEndpointUrl, comfyBaseUrl)
    ).length;

  const activeAssetStatuses = new Set(["queued", "running"]);
  const assetRows = db
    .select({
      status: schema.assetGenerationOptions.status,
      comfyuiEndpointUrl: schema.assetGenerationBatches.comfyuiEndpointUrl,
    })
    .from(schema.assetGenerationOptions)
    .innerJoin(
      schema.assetGenerationBatches,
      eq(
        schema.assetGenerationOptions.batchId,
        schema.assetGenerationBatches.id
      )
    )
    .all();

  const assets = assetRows.filter(
    (row) =>
      activeAssetStatuses.has(row.status) &&
      sameComfyEndpoint(row.comfyuiEndpointUrl, comfyBaseUrl)
  ).length;

  return { renders, assets };
}

export async function isComfyQueueBusy(comfyBaseUrl: string): Promise<boolean> {
  try {
    const queue = await getQueue(comfyBaseUrl);
    return queue.queue_running.length > 0 || queue.queue_pending.length > 0;
  } catch {
    // Unreachable Comfy: do not block forever on queue polls; DiffuseCut jobs still gate.
    return false;
  }
}

export async function describeComfyGpuBusyReason(
  comfyBaseUrl: string,
  exceptHolder?: string
): Promise<string | null> {
  const lease = getActiveComfyGpuLease(comfyBaseUrl);
  if (lease && lease.holder !== exceptHolder) {
    return lease.reason || "another DiffuseCut GPU job";
  }

  const { renders, assets } = countActiveDiffuseCutJobs(comfyBaseUrl);
  if (renders > 0) {
    return renders === 1
      ? "a video render is still running or queued"
      : `${renders} video renders are still running or queued`;
  }
  if (assets > 0) {
    return assets === 1
      ? "an image generation is still running or queued"
      : `${assets} image generations are still running or queued`;
  }

  if (await isComfyQueueBusy(comfyBaseUrl)) {
    return "ComfyUI is still busy";
  }

  return null;
}

/**
 * Resolve the ComfyUI host that shares the GPU with ACE-Step / audio work.
 * Null when there is nothing to wait on (e.g. cloud-only voiceover).
 */
export async function resolveSharedComfyUrlForAudio(): Promise<string | null> {
  const mode = await getAceStepComputeModeSetting();
  const remote = await getAceStepRemoteUrlSetting();

  if (mode === "remote" && remote) {
    try {
      const parsed = new URL(remote.trim());
      // Dedicated ACE API often shares the box with Comfy on 8188.
      if (parsed.port === "8002" || /ace/i.test(parsed.pathname)) {
        return normalizeUrl(`http://${parsed.hostname}:8188`);
      }
      return normalizeUrl(remote);
    } catch {
      /* fall through */
    }
  }

  const endpoints = await getDefaultComfyuiEndpoints();
  return endpoints[0] ? normalizeUrl(endpoints[0]) : null;
}

/**
 * Wait until DiffuseCut video/image jobs and ComfyUI are idle on this host,
 * then take a short lease so the worker does not start the next render mid-score.
 */
export async function waitAndAcquireComfyGpuLease(options: {
  comfyBaseUrl: string;
  holder: string;
  reason: string;
  timeoutMs?: number;
  pollMs?: number;
  ttlMs?: number;
}): Promise<{ waitedMs: number; waitedFor: string | null }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const ttlMs = options.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  const baseUrl = normalizeUrl(options.comfyBaseUrl);
  const started = Date.now();
  let firstBusy: string | null = null;

  while (Date.now() - started < timeoutMs) {
    const busy = await describeComfyGpuBusyReason(baseUrl, options.holder);
    if (!busy) {
      writeLease({
        holder: options.holder,
        reason: options.reason,
        comfyBaseUrl: baseUrl,
        expiresAt: Date.now() + ttlMs,
      });

      const held = readLease();
      if (!held || held.holder !== options.holder) {
        await sleep(pollMs);
        continue;
      }

      // Lost the race to a new render job that started between idle check and lease.
      const stillBusy = await describeComfyGpuBusyReason(
        baseUrl,
        options.holder
      );
      if (!stillBusy) {
        return {
          waitedMs: Date.now() - started,
          waitedFor: firstBusy,
        };
      }
      releaseComfyGpuLease(options.holder);
    } else if (!firstBusy) {
      firstBusy = busy;
    }

    await sleep(pollMs);
  }

  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the GPU (${firstBusy ?? "busy"}). Try again when the video render finishes.`
  );
}

/** Convenience for score / SFX generation that may share a Comfy GPU. */
export async function withComfyGpuLeaseForAudio<T>(options: {
  holder: string;
  reason: string;
  comfyBaseUrl?: string | null;
  run: () => Promise<T>;
}): Promise<T & { gpuWaitedMs?: number; gpuWaitedFor?: string | null }> {
  const baseUrl =
    options.comfyBaseUrl === undefined
      ? await resolveSharedComfyUrlForAudio()
      : options.comfyBaseUrl
        ? normalizeUrl(options.comfyBaseUrl)
        : null;

  if (!baseUrl) {
    return options.run() as Promise<
      T & { gpuWaitedMs?: number; gpuWaitedFor?: string | null }
    >;
  }

  const { waitedMs, waitedFor } = await waitAndAcquireComfyGpuLease({
    comfyBaseUrl: baseUrl,
    holder: options.holder,
    reason: options.reason,
  });

  try {
    const result = await options.run();
    return Object.assign(result as object, {
      gpuWaitedMs: waitedMs,
      gpuWaitedFor: waitedFor,
    }) as T & { gpuWaitedMs?: number; gpuWaitedFor?: string | null };
  } finally {
    releaseComfyGpuLease(options.holder);
  }
}
