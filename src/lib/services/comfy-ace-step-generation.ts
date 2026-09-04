import fs from "fs";
import path from "path";
import { randomInt } from "crypto";
import { aceStepPromptForKind, resolveAceStepSourceDuration } from "@/lib/services/ace-step-prompt";
import {
  downloadOutput,
  extractAudioOutputFiles,
  isAceStepAvailable,
  normalizeUrl,
  queuePrompt,
  waitForHistory,
} from "@/lib/services/comfyui-client";
import { ACE_STEP_AIO_CHECKPOINT } from "@/lib/services/comfyui-workflow-requirements";

const WORKFLOW_PATH = path.join(
  process.cwd(),
  "scripts",
  "ace-step",
  "comfy-t2a-workflow.json"
);

function loadWorkflowTemplate(): Record<string, unknown> {
  if (!fs.existsSync(WORKFLOW_PATH)) {
    throw new Error(`Missing ACE-Step Comfy workflow at ${WORKFLOW_PATH}`);
  }
  return JSON.parse(fs.readFileSync(WORKFLOW_PATH, "utf-8")) as Record<
    string,
    unknown
  >;
}

function parseKeyscale(keyscale: string): { key: string; timesignature: string } {
  const match = keyscale.match(/^([A-G](?:#|b)?)\s+(major|minor)$/i);
  if (!match) {
    return { key: "A minor", timesignature: "4" };
  }
  return {
    key: `${match[1]} ${match[2].toLowerCase()}`,
    timesignature: "4",
  };
}

export async function isComfyAceStepGenerationReady(
  baseUrl: string
): Promise<boolean> {
  return isAceStepAvailable(normalizeUrl(baseUrl));
}

export async function generateComfyAceStepAudioFile(options: {
  baseUrl: string;
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
  kind: "music" | "voiceover" | "sfx";
}): Promise<{
  provider: string;
  sourceSeconds: number;
  comfyUrl: string;
  aceStepPrompt?: {
    tags: string;
    lyrics: string;
    bpm: number;
    keyscale: string;
  };
}> {
  const baseUrl = normalizeUrl(options.baseUrl);
  const ready = await isAceStepAvailable(baseUrl);
  if (!ready) {
    throw new Error(
      `ComfyUI at ${baseUrl} does not have ACE-Step 1.5 nodes and ${ACE_STEP_AIO_CHECKPOINT} installed.`
    );
  }

  const sourceSeconds = resolveAceStepSourceDuration(
    options.kind,
    options.durationSeconds
  );
  const acePrompt = aceStepPromptForKind(
    options.kind,
    options.prompt,
    sourceSeconds
  );
  const bpm = acePrompt.bpm ?? (options.kind === "sfx" ? 60 : 90);
  const keyscale = acePrompt.keyscale ?? (options.kind === "sfx" ? "C major" : "A minor");
  const parsedKey = parseKeyscale(keyscale);
  const tags = acePrompt.tags;
  const lyrics =
    options.kind === "music"
      ? acePrompt.lyrics?.trim() || ""
      : options.kind === "voiceover"
        ? options.prompt.trim()
        : "";

  const seed = randomInt(1, 2_000_000_000);
  const graph = loadWorkflowTemplate() as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  graph["3"]!.inputs!.tags = tags;
  graph["3"]!.inputs!.lyrics = lyrics;
  graph["3"]!.inputs!.seed = seed;
  graph["3"]!.inputs!.bpm = bpm;
  graph["3"]!.inputs!.duration = sourceSeconds;
  graph["3"]!.inputs!.keyscale = parsedKey.key;
  graph["3"]!.inputs!.timesignature = parsedKey.timesignature;
  graph["3"]!.inputs!.generate_audio_codes = true;
  graph["3"]!.inputs!.temperature = 0.0;

  graph["5"]!.inputs!.seconds = sourceSeconds;
  graph["6"]!.inputs!.seed = seed;
  graph["8"]!.inputs!.filename_prefix = `diffusecut/ace_step_${Date.now()}`;

  const queued = await queuePrompt(baseUrl, graph);
  const history = await waitForHistory(baseUrl, queued.prompt_id, {
    timeoutMs: Math.max(20 * 60_000, sourceSeconds * 8000),
  });

  if (history.status?.status_str === "error") {
    throw new Error(
      `ComfyUI ACE-Step job failed: ${JSON.stringify(history.status).slice(0, 400)}`
    );
  }

  const audioFiles = extractAudioOutputFiles(history);
  if (audioFiles.length === 0) {
    throw new Error(
      "ComfyUI ACE-Step finished but returned no audio file. Check the ComfyUI console on the GPU server."
    );
  }

  const scratchPath = options.outputAbsolutePath.endsWith(".mp3")
    ? options.outputAbsolutePath
    : path.join(
        path.dirname(options.outputAbsolutePath),
        `.gen-comfy-${Date.now()}.mp3`
      );

  await downloadOutput(baseUrl, audioFiles[0], scratchPath);

  return {
    provider: "ace_step_comfy",
    sourceSeconds,
    comfyUrl: baseUrl,
    aceStepPrompt: {
      tags,
      lyrics,
      bpm,
      keyscale: parsedKey.key,
    },
  };
}
