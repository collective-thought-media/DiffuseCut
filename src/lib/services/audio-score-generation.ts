import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import { generateAceStepAudioFile } from "@/lib/services/ace-step-audio-generation";
import { getFfmpegPathSetting, getSetting } from "@/lib/services/settings";
import { resolveScoreGenerationProvider } from "@/lib/services/score-audio-source";
import { ensureDir } from "@/lib/paths/app-paths";

const ELEVENLABS_MAX_SECONDS = 22;

const execFileAsync = promisify(execFile);

async function configureFfmpeg(): Promise<void> {
  const custom = await getFfmpegPathSetting();
  if (custom) {
    ffmpeg.setFfmpegPath(custom);
  }
}

async function getConfiguredFfmpegPath(): Promise<string> {
  await configureFfmpeg();
  const custom = await getFfmpegPathSetting();
  if (custom?.trim()) return custom.trim();
  return "ffmpeg";
}

function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on("end", () => resolve()).on("error", (err) => reject(err)).run();
  });
}

async function getMusicApiKey(): Promise<string | null> {
  return (
    (await getSetting("music_api_key")) ??
    (await getSetting("elevenlabs_api_key")) ??
    process.env.ELEVENLABS_API_KEY ??
    process.env.MUSIC_API_KEY ??
    null
  );
}

async function generateElevenLabsClip(
  prompt: string,
  durationSeconds: number,
  apiKey: string,
  options?: { promptInfluence?: number }
): Promise<Buffer> {
  const requestDuration = Math.min(
    ELEVENLABS_MAX_SECONDS,
    Math.max(0.5, durationSeconds)
  );

  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: requestDuration,
      prompt_influence: options?.promptInfluence ?? 0.35,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `ElevenLabs generation failed (${res.status}). ${detail.slice(0, 240)}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fitAudioToDuration(
  inputPath: string,
  outputPath: string,
  durationSeconds: number
): Promise<void> {
  await configureFfmpeg();
  ensureDir(path.dirname(outputPath));

  const targetSeconds = Math.max(0.1, durationSeconds);
  let sourceSeconds = 0;

  try {
    sourceSeconds = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(metadata.format.duration ?? 0);
      });
    });
  } catch {
    sourceSeconds = 0;
  }

  const outputOptions = [
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    String(targetSeconds),
  ];

  if (sourceSeconds > 0 && sourceSeconds < targetSeconds * 0.92) {
    await runFfmpeg(
      ffmpeg(inputPath)
        .inputOptions(["-stream_loop", "-1"])
        .outputOptions(outputOptions)
        .output(outputPath)
    );
    return;
  }

  await runFfmpeg(ffmpeg(inputPath).outputOptions(outputOptions).output(outputPath));
}

/** Trim Woosh strike output to the opening burst (Woosh often pads ~18s of output). */
export async function prepareImpulseStrikeClip(
  inputPath: string,
  outputPath: string,
  clipSeconds = 0.45
): Promise<void> {
  await configureFfmpeg();
  ensureDir(path.dirname(outputPath));
  const clip = Math.max(0.2, Math.min(clipSeconds, 0.8));

  await runFfmpeg(
    ffmpeg(inputPath)
      .outputOptions(["-t", String(clip)])
      .audioFilters([
        "highpass=f=400",
        "acompressor=threshold=-30dB:ratio=8:attack=1:release=30",
        "afade=t=out:st=0.03:d=0.12",
      ])
      .outputOptions(["-c:a", "libmp3lame", "-b:a", "192k"])
      .output(outputPath)
  );
}

/** Guaranteed impulsive crack (Woosh strike prompts often produce sustained noise, not a bolt). */
export async function generateSyntheticLightningCrack(
  outputPath: string
): Promise<void> {
  ensureDir(path.dirname(outputPath));
  const ffmpegPath = await getConfiguredFfmpegPath();
  const filter =
    "[0:a]highpass=f=2500,lowpass=16000,acompressor=threshold=-12dB:ratio=20:attack=1:release=8,volume=18dB,adelay=0|0[zap];" +
    "[1:a]lowpass=f=350,afade=t=in:st=0:d=0.02,volume=6dB,afade=t=out:st=0.15:d=0.35[rumble];" +
    "[zap][rumble]amix=inputs=2:duration=longest:dropout_transition=0[hit]";

  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-f",
      "lavfi",
      "-i",
      "anoisesrc=d=0.035:c=white:a=1.0",
      "-f",
      "lavfi",
      "-i",
      "anoisesrc=d=0.45:c=brown:a=0.4",
      "-filter_complex",
      filter,
      "-map",
      "[hit]",
      "-t",
      "0.5",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outputPath,
    ],
    { maxBuffer: 10 * 1024 * 1024 }
  );
}

/** Synthetic crack is primary; optional Woosh trim adds thunder body underneath. */
export async function compositeLightningStrikeLayers(
  syntheticPath: string,
  wooshStrikePath: string | null,
  outputPath: string
): Promise<void> {
  await configureFfmpeg();
  ensureDir(path.dirname(outputPath));

  if (wooshStrikePath && fs.existsSync(wooshStrikePath)) {
    await runFfmpeg(
      ffmpeg()
        .input(syntheticPath)
        .input(wooshStrikePath)
        .complexFilter([
          "[0:a]volume=2.0[synth]",
          "[1:a]volume=0.45[woosh]",
          "[synth][woosh]amix=inputs=2:duration=longest:dropout_transition=0[aout]",
        ])
        .outputOptions(["-map", "[aout]", "-c:a", "libmp3lame", "-b:a", "192k"])
        .output(outputPath)
    );
    return;
  }

  await runFfmpeg(
    ffmpeg(syntheticPath)
      .audioFilters(["volume=2.0"])
      .outputOptions(["-c:a", "libmp3lame", "-b:a", "192k"])
      .output(outputPath)
  );
}

/** Layer a short impulsive hit (lightning crack) over a longer ambience bed. */
export async function compositeStrikeOverBed(
  strikePath: string,
  bedPath: string,
  outputPath: string,
  durationSeconds: number
): Promise<void> {
  await configureFfmpeg();
  ensureDir(path.dirname(outputPath));
  const duration = Math.max(0.5, durationSeconds);

  await runFfmpeg(
    ffmpeg()
      .input(strikePath)
      .input(bedPath)
      .complexFilter([
        `[0:a]apad=pad_dur=${duration},volume=2.1[strike]`,
        `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.24[bed]`,
        `[strike][bed]amix=inputs=2:duration=longest:dropout_transition=0[aout]`,
      ])
      .outputOptions([
        "-map",
        "[aout]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-t",
        String(duration),
      ])
      .output(outputPath)
  );
}

export { fitAudioToDuration };

export async function generateScoreAudioFile(options: {
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
  kind: "music" | "voiceover";
}): Promise<{
  provider: string;
  sourceSeconds: number;
  aceStepPrompt?: {
    tags: string;
    lyrics: string;
    bpm: number;
    keyscale: string;
  };
}> {
  if (!options.prompt.trim()) {
    throw new Error("Describe the score or sound before generating.");
  }

  const provider = await resolveScoreGenerationProvider();
  const scratchDir = path.join(path.dirname(options.outputAbsolutePath), ".gen");
  ensureDir(scratchDir);

  if (provider === "ace_step") {
    const rawPath = path.join(scratchDir, "ace-step.flac");
    const aceResult = await generateAceStepAudioFile({
      ...options,
      outputAbsolutePath: rawPath,
    });

    ensureDir(path.dirname(options.outputAbsolutePath));
    await fitAudioToDuration(
      rawPath,
      options.outputAbsolutePath,
      options.durationSeconds
    );
    fs.rmSync(scratchDir, { recursive: true, force: true });
    return {
      provider: aceResult.provider,
      sourceSeconds: aceResult.sourceSeconds,
      aceStepPrompt: aceResult.aceStepPrompt,
    };
  }

  const apiKey = await getMusicApiKey();
  if (!apiKey) {
    throw new Error(
      "No ElevenLabs key configured. Upload your own score file, set up ACE-Step, or add ElevenLabs in Settings."
    );
  }

  const rawPath = path.join(scratchDir, "raw.mp3");

  const sourceSeconds = Math.min(
    ELEVENLABS_MAX_SECONDS,
    Math.max(0.5, options.durationSeconds)
  );

  const fullPrompt =
    options.kind === "music"
      ? `Cinematic score: ${options.prompt.trim()}`
      : `Voiceover tone bed: ${options.prompt.trim()}`;

  const buffer = await generateElevenLabsClip(
    fullPrompt,
    sourceSeconds,
    apiKey
  );
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

  return { provider: "elevenlabs", sourceSeconds };
}
