import { getSetting } from "@/lib/services/settings";

/** Default ElevenLabs preset voice (Chris). Override with dialog_voice_id in Settings. */
export const DEFAULT_DIALOG_VOICE_ID = "iP95p4xoKVk53GoZ742B";

export const DIALOG_TTS_MODEL_ID = "eleven_multilingual_v2";

export async function getElevenLabsApiKey(): Promise<string | null> {
  return (
    (await getSetting("music_api_key")) ??
    (await getSetting("elevenlabs_api_key")) ??
    process.env.ELEVENLABS_API_KEY ??
    process.env.MUSIC_API_KEY ??
    null
  );
}

export async function getDialogVoiceId(): Promise<string> {
  const custom = (await getSetting("dialog_voice_id"))?.trim();
  return custom || DEFAULT_DIALOG_VOICE_ID;
}

export async function generateElevenLabsVoiceoverClip(
  scriptText: string,
  apiKey: string,
  options?: { voiceId?: string }
): Promise<Buffer> {
  const text = scriptText.trim();
  if (!text) {
    throw new Error("Add the lines to speak before generating dialog.");
  }

  const voiceId = options?.voiceId ?? (await getDialogVoiceId());
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: DIALOG_TTS_MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `ElevenLabs dialog speech failed (${res.status}). ${detail.slice(0, 280)}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
