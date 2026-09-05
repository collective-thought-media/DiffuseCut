import fs from "fs";
import path from "path";
import { randomInt } from "crypto";
import {
  downloadOutput,
  extractAudioOutputFiles,
  getObjectInfo,
  normalizeUrl,
  queuePrompt,
  waitForHistory,
} from "@/lib/services/comfyui-client";
import { WOOSH_NODE_CLASSES } from "@/lib/services/comfyui-workflow-requirements";
import { buildWooshSfxPrompt } from "@/lib/services/sfx-prompt";
import { getDefaultComfyuiEndpoints } from "@/lib/services/settings";
import { getAceStepRemoteUrlSetting } from "@/lib/services/ace-step-compute";

function hostComfyUrlFromAceStepRemote(remoteUrl: string | null): string | null {
  if (!remoteUrl?.trim()) return null;
  try {
    const parsed = new URL(remoteUrl.trim());
    return `http://${parsed.hostname}:8188`;
  } catch {
    return null;
  }
}

async function candidateComfyEndpoints(): Promise<string[]> {
  const endpoints = await getDefaultComfyuiEndpoints();
  const remoteComfy = hostComfyUrlFromAceStepRemote(
    await getAceStepRemoteUrlSetting()
  );
  const merged = [...endpoints];
  if (remoteComfy && !merged.includes(remoteComfy)) {
    merged.push(remoteComfy);
  }
  return merged;
}

const WORKFLOW_PATH = path.join(
  process.cwd(),
  "scripts",
  "woosh",
  "comfy-t2a-workflow.json"
);

const WOOSH_FRAMES_PER_SECOND = 100;
const WOOSH_MAX_FRAMES = 801;

function loadWorkflowTemplate(): Record<
  string,
  { class_type?: string; inputs?: Record<string, unknown> }
> {
  if (!fs.existsSync(WORKFLOW_PATH)) {
    throw new Error(`Missing Woosh Comfy workflow at ${WORKFLOW_PATH}`);
  }
  return JSON.parse(fs.readFileSync(WORKFLOW_PATH, "utf-8")) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
}

function durationToLatentFrames(durationSeconds: number): number {
  return Math.min(
    WOOSH_MAX_FRAMES,
    Math.max(100, Math.round(durationSeconds * WOOSH_FRAMES_PER_SECOND))
  );
}

export async function isComfyWooshAvailable(baseUrl: string): Promise<boolean> {
  const normalized = normalizeUrl(baseUrl);
  try {
    const objectInfo = await getObjectInfo(normalized);
    const hasNodes = WOOSH_NODE_CLASSES.every(
      (classType) => classType in objectInfo
    );
    if (!hasNodes) return false;

    const modelsRes = await fetch(`${normalized}/models/woosh`);
    if (!modelsRes.ok) return false;
    const models = (await modelsRes.json()) as string[];
    return models.some((name) => /dflow|flow/i.test(name));
  } catch {
    return false;
  }
}

export async function resolveComfyWooshEndpoint(): Promise<string | null> {
  const endpoints = await candidateComfyEndpoints();
  for (const endpoint of endpoints) {
    if (await isComfyWooshAvailable(endpoint)) {
      return normalizeUrl(endpoint);
    }
  }
  return null;
}

export async function generateComfyWooshSfxFile(options: {
  baseUrl: string;
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
  /** When true, `prompt` is already model-ready and must not be reprocessed. */
  promptIsFinal?: boolean;
}): Promise<{
  provider: "woosh_comfy";
  sourceSeconds: number;
  comfyUrl: string;
  prompt: string;
}> {
  const baseUrl = normalizeUrl(options.baseUrl);
  const ready = await isComfyWooshAvailable(baseUrl);
  if (!ready) {
    throw new Error(
      `ComfyUI at ${baseUrl} does not have ComfyUI-Woosh installed.`
    );
  }

  const prompt = options.promptIsFinal
    ? options.prompt.trim()
    : buildWooshSfxPrompt(options.prompt);
  const latentFrames = durationToLatentFrames(options.durationSeconds);
  const seed = randomInt(1, 2_000_000_000);
  const sourceSeconds = latentFrames / WOOSH_FRAMES_PER_SECOND;
  const useHeroCfg = /lightning|thunder|explosion|gunshot|door creak|metal clash/i.test(
    prompt
  );

  const graph = loadWorkflowTemplate();
  graph["3"]!.inputs!.prompt = prompt;
  graph["3"]!.inputs!.seed = seed;
  graph["3"]!.inputs!.latent_frames = latentFrames;
  graph["3"]!.inputs!.cfg = useHeroCfg ? 4.5 : 3.5;
  graph["4"]!.inputs!.filename_prefix = `diffusecut/woosh_sfx_${Date.now()}`;

  const queued = await queuePrompt(baseUrl, graph);
  const history = await waitForHistory(baseUrl, queued.prompt_id, {
    timeoutMs: Math.max(10 * 60_000, sourceSeconds * 20_000),
  });

  if (history.status?.status_str === "error") {
    throw new Error(
      `ComfyUI Woosh job failed: ${JSON.stringify(history.status).slice(0, 400)}`
    );
  }

  const audioFiles = extractAudioOutputFiles(history);
  if (audioFiles.length === 0) {
    throw new Error(
      "ComfyUI Woosh finished but returned no audio file. Check the ComfyUI console on the GPU server."
    );
  }

  const scratchPath = options.outputAbsolutePath.endsWith(".mp3")
    ? options.outputAbsolutePath
    : path.join(
        path.dirname(options.outputAbsolutePath),
        `.gen-woosh-${Date.now()}.mp3`
      );

  await downloadOutput(baseUrl, audioFiles[0], scratchPath);

  if (scratchPath !== options.outputAbsolutePath) {
    fs.mkdirSync(path.dirname(options.outputAbsolutePath), { recursive: true });
    fs.copyFileSync(scratchPath, options.outputAbsolutePath);
    fs.rmSync(scratchPath, { force: true });
  }

  return {
    provider: "woosh_comfy",
    sourceSeconds,
    comfyUrl: baseUrl,
    prompt,
  };
}
