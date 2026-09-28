import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

let envFileLoaded = false;

function loadProjectEnvFile(): void {
  if (envFileLoaded) return;
  envFileLoaded = true;
  if (process.env.DIFFUSECUT_GPU_YIELD_COMMAND?.trim()) return;
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const loadEnvFile = (
    process as NodeJS.Process & { loadEnvFile?: (file: string) => void }
  ).loadEnvFile;
  if (typeof loadEnvFile !== "function") return;
  try {
    loadEnvFile(envPath);
  } catch {
    /* keep going with the process environment */
  }
}

/** True when this ComfyUI host should free competing models before a job. */
export function gpuYieldApplies(
  comfyBaseUrl: string,
  env: { command?: string; hosts?: string }
): boolean {
  if (!env.command?.trim()) return false;
  const hosts = (env.hosts ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (hosts.length === 0) return true;
  let hostname = "";
  try {
    hostname = new URL(comfyBaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.includes(hostname);
}

/**
 * Run the configured yield command so a resident LLM is not still on the GPU
 * when ComfyUI loads an image or video model. No-op unless
 * DIFFUSECUT_GPU_YIELD_COMMAND is set.
 */
export async function yieldGpuBeforeComfy(comfyBaseUrl: string): Promise<void> {
  loadProjectEnvFile();
  const command = process.env.DIFFUSECUT_GPU_YIELD_COMMAND ?? "";
  const hosts = process.env.DIFFUSECUT_GPU_YIELD_HOSTS ?? "";
  if (!gpuYieldApplies(comfyBaseUrl, { command, hosts })) return;

  try {
    await execAsync(command, {
      timeout: 90_000,
      windowsHide: true,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[gpu-yield] failed to free GPU before ComfyUI job:", detail);
    throw new Error(
      "Could not free the GPU before this render. The image job was not sent."
    );
  }
}
