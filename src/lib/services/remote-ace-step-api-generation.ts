import fs from "fs";
import path from "path";
import { aceStepPromptForKind, resolveAceStepSourceDuration } from "@/lib/services/ace-step-prompt";

const GENERATION_TIMEOUT_MS = 20 * 60_000;

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function decodeDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) {
    throw new Error("Remote ACE-Step returned an invalid audio data URL.");
  }
  const payload = dataUrl.slice(comma + 1);
  return Buffer.from(payload, "base64");
}

export async function isRemoteAceStepApiReachable(
  remoteUrl: string,
  timeoutMs = 5000
): Promise<boolean> {
  const base = normalizeBaseUrl(remoteUrl);
  if (!base) return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function generateRemoteAceStepApiAudioFile(options: {
  remoteUrl: string;
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
  kind: "music" | "voiceover" | "sfx";
}): Promise<{
  provider: string;
  sourceSeconds: number;
  remoteUrl: string;
  aceStepPrompt?: {
    tags: string;
    lyrics: string;
    bpm: number;
    keyscale: string;
  };
}> {
  const base = normalizeBaseUrl(options.remoteUrl);
  const reachable = await isRemoteAceStepApiReachable(base);
  if (!reachable) {
    throw new Error(
      `ACE-Step API is unreachable at ${base}. Start scripts/local-dev/start-ace-step-api.ps1 on the GPU server.`
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
  const lyrics =
    options.kind === "music"
      ? acePrompt.lyrics?.trim() || "[Instrumental]"
      : acePrompt.lyrics ?? "";

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(GENERATION_TIMEOUT_MS, sourceSeconds * 8000)
  );

  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "acemusic/acestep-v15-turbo",
        messages: [
          {
            role: "user",
            content: acePrompt.tags,
          },
        ],
        modalities: ["audio"],
        audio_config: {
          duration: sourceSeconds,
          bpm,
          key_scale: keyscale,
          instrumental: options.kind !== "voiceover",
          format: "flac",
        },
        lyrics,
        thinking: options.kind !== "sfx",
        use_format: options.kind !== "sfx",
        use_cot_metas: false,
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{
      message?: {
        audio?: Array<{ audio_url?: { url?: string } }>;
      };
    }>;
  };

  if (!res.ok) {
    const detail =
      data.error?.message ??
      JSON.stringify(data).slice(0, 240) ??
      res.statusText;
    throw new Error(`Remote ACE-Step API failed (${res.status}). ${detail}`);
  }

  const audioUrl =
    data.choices?.[0]?.message?.audio?.[0]?.audio_url?.url ?? "";
  if (!audioUrl.startsWith("data:")) {
    throw new Error(
      "Remote ACE-Step API completed but returned no audio payload."
    );
  }

  const audioBuffer = decodeDataUrl(audioUrl);
  fs.mkdirSync(path.dirname(options.outputAbsolutePath), { recursive: true });
  fs.writeFileSync(options.outputAbsolutePath, audioBuffer);

  return {
    provider: "ace_step_remote_api",
    sourceSeconds,
    remoteUrl: base,
    aceStepPrompt: {
      tags: acePrompt.tags,
      lyrics,
      bpm,
      keyscale,
    },
  };
}
