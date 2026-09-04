import fs from "fs";
import path from "path";
import {
  compositeLightningStrikeLayers,
  compositeStrikeOverBed,
  fitAudioToDuration,
  generateSyntheticLightningCrack,
  prepareImpulseStrikeClip,
} from "@/lib/services/audio-score-generation";
import {
  generateComfyWooshSfxFile,
  resolveComfyWooshEndpoint,
} from "@/lib/services/comfy-woosh-generation";
import { getSetting } from "@/lib/services/settings";
import {
  buildElevenLabsSfxPrompt,
  buildWooshSfxPrompt,
  resolveSfxGenerationDuration,
} from "@/lib/services/sfx-prompt";
import { ensureDir } from "@/lib/paths/app-paths";

const ELEVENLABS_SFX_URL = "https://api.elevenlabs.io/v1/sound-generation";
const LIGHTNING_WOOSH_SOURCE_SECONDS = 1.5;

export async function getElevenLabsApiKey(): Promise<string | null> {
  return (
    (await getSetting("music_api_key")) ??
    (await getSetting("elevenlabs_api_key")) ??
    process.env.ELEVENLABS_API_KEY ??
    process.env.MUSIC_API_KEY ??
    null
  );
}

export async function isElevenLabsSfxConfigured(): Promise<boolean> {
  const key = await getElevenLabsApiKey();
  return Boolean(key?.trim());
}

export async function isSfxGenerationConfigured(): Promise<boolean> {
  const woosh = await resolveComfyWooshEndpoint();
  if (woosh) return true;
  return isElevenLabsSfxConfigured();
}

async function generateElevenLabsSfxClip(
  prompt: string,
  durationSeconds: number,
  apiKey: string,
  options?: { promptInfluence?: number }
): Promise<Buffer> {
  const requestDuration = resolveSfxGenerationDuration(durationSeconds);

  const res = await fetch(ELEVENLABS_SFX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: requestDuration,
      prompt_influence: options?.promptInfluence ?? 0.6,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `ElevenLabs sound generation failed (${res.status}). ${detail.slice(0, 280)}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateWooshLayer(options: {
  wooshUrl: string;
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
}): Promise<void> {
  await generateComfyWooshSfxFile({
    baseUrl: options.wooshUrl,
    prompt: options.prompt,
    promptIsFinal: true,
    durationSeconds: options.durationSeconds,
    outputAbsolutePath: options.outputAbsolutePath,
  });
}

export async function generateSfxAudioFile(options: {
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
  modelPrompt?: string;
  strikeModelPrompt?: string | null;
  bedModelPrompt?: string | null;
}): Promise<{
  provider: "woosh_comfy" | "elevenlabs_sfx";
  sourceSeconds: number;
  prompt: string;
}> {
  if (!options.prompt.trim() && !options.modelPrompt?.trim()) {
    throw new Error("Describe the sound effect before generating.");
  }

  const modelPrompt =
    options.modelPrompt?.trim() ||
    buildWooshSfxPrompt(options.prompt.trim());

  const scratchDir = path.join(
    path.dirname(options.outputAbsolutePath),
    `.gen-${Date.now()}`
  );
  ensureDir(scratchDir);

  const wooshUrl = await resolveComfyWooshEndpoint();
  if (wooshUrl) {
    const rawPath = path.join(scratchDir, "woosh-raw.mp3");
    const useStrikeLayer = Boolean(
      options.strikeModelPrompt?.trim() && options.bedModelPrompt?.trim()
    );

    if (useStrikeLayer) {
      const strikePath = path.join(scratchDir, "strike.mp3");
      const bedPath = path.join(scratchDir, "bed.mp3");
      const mixedPath = path.join(scratchDir, "mixed.mp3");

      const strikeRawPath = path.join(scratchDir, "strike-raw.mp3");
      const wooshStrikePath = path.join(scratchDir, "strike-woosh-trim.mp3");
      const syntheticPath = path.join(scratchDir, "strike-synthetic.mp3");

      await generateWooshLayer({
        wooshUrl,
        prompt: options.strikeModelPrompt!.trim(),
        durationSeconds: LIGHTNING_WOOSH_SOURCE_SECONDS,
        outputAbsolutePath: strikeRawPath,
      });
      await prepareImpulseStrikeClip(strikeRawPath, wooshStrikePath, 0.45);
      await generateSyntheticLightningCrack(syntheticPath);
      await compositeLightningStrikeLayers(
        syntheticPath,
        wooshStrikePath,
        strikePath
      );
      await generateWooshLayer({
        wooshUrl,
        prompt: options.bedModelPrompt!.trim(),
        durationSeconds: options.durationSeconds,
        outputAbsolutePath: bedPath,
      });

      await compositeStrikeOverBed(
        strikePath,
        bedPath,
        mixedPath,
        options.durationSeconds
      );

      ensureDir(path.dirname(options.outputAbsolutePath));
      await fitAudioToDuration(
        mixedPath,
        options.outputAbsolutePath,
        options.durationSeconds
      );

      if (fs.existsSync(scratchDir)) {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      }

      return {
        provider: "woosh_comfy",
        sourceSeconds: options.durationSeconds,
        prompt: `${options.strikeModelPrompt} + ${options.bedModelPrompt}`,
      };
    }

    const wooshResult = await generateComfyWooshSfxFile({
      baseUrl: wooshUrl,
      prompt: modelPrompt,
      promptIsFinal: Boolean(options.modelPrompt?.trim()),
      durationSeconds: options.durationSeconds,
      outputAbsolutePath: rawPath,
    });

    ensureDir(path.dirname(options.outputAbsolutePath));
    await fitAudioToDuration(
      rawPath,
      options.outputAbsolutePath,
      options.durationSeconds
    );

    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }

    return wooshResult;
  }

  const apiKey = await getElevenLabsApiKey();
  if (!apiKey?.trim()) {
    throw new Error(
      "Sound effects need ComfyUI-Woosh on your GPU Comfy server (port 8188), or an ElevenLabs API key in Settings. ACE-Step is score only and cannot generate SFX."
    );
  }

  const sourceSeconds = resolveSfxGenerationDuration(options.durationSeconds);
  const elevenPrompt = buildElevenLabsSfxPrompt(modelPrompt);
  const rawPath = path.join(scratchDir, "sfx-raw.mp3");

  const buffer = await generateElevenLabsSfxClip(elevenPrompt, sourceSeconds, apiKey);
  fs.writeFileSync(rawPath, buffer);

  ensureDir(path.dirname(options.outputAbsolutePath));
  await fitAudioToDuration(
    rawPath,
    options.outputAbsolutePath,
    options.durationSeconds
  );

  if (fs.existsSync(scratchDir)) {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }

  return {
    provider: "elevenlabs_sfx",
    sourceSeconds,
    prompt: elevenPrompt,
  };
}
