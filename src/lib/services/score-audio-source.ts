import { getSetting } from "@/lib/services/settings";
import { isAceStepGenerationReady } from "@/lib/services/ace-step-audio-generation";
import {
  DEFAULT_DIALOG_EDGE_TTS_VOICE,
  getDialogEdgeTtsVoice,
  isEdgeTtsVoiceoverReady,
} from "@/lib/services/local-edge-tts-voiceover";
import { getAceStepComputeModeSetting } from "@/lib/services/ace-step-compute";

export type ScoreAudioProvider = "auto" | "ace_step" | "elevenlabs" | "upload";

export type ScoreAudioSource =
  | "ace_step"
  | "elevenlabs"
  | "epidemic_upload";

export interface ScoreAudioSourceStatus {
  provider: ScoreAudioProvider;
  primary: ScoreAudioSource;
  aceStepReady: boolean;
  aceStepComputeMode: "local" | "remote";
  elevenLabsConfigured: boolean;
}

export async function getScoreAudioProviderSetting(): Promise<ScoreAudioProvider> {
  const raw = (await getSetting("score_audio_provider")) ?? "auto";
  if (
    raw === "ace_step" ||
    raw === "elevenlabs" ||
    raw === "upload" ||
    raw === "auto"
  ) {
    return raw;
  }
  return "auto";
}

/** Resolves which musical-score paths are available. Upload always works. */
export async function getScoreAudioSourceStatus(): Promise<ScoreAudioSourceStatus> {
  const musicKey = await getSetting("music_api_key");
  const legacyKey = await getSetting("elevenlabs_api_key");
  const envKey =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.MUSIC_API_KEY?.trim() ||
    "";

  const elevenLabsConfigured = Boolean(
    musicKey?.trim() || legacyKey?.trim() || envKey
  );
  const aceStepReady = await isAceStepGenerationReady();
  const aceStepComputeMode = await getAceStepComputeModeSetting();
  const provider = await getScoreAudioProviderSetting();

  let primary: ScoreAudioSource = "epidemic_upload";
  if (provider === "ace_step" && aceStepReady) {
    primary = "ace_step";
  } else if (provider === "elevenlabs" && elevenLabsConfigured) {
    primary = "elevenlabs";
  } else if (provider === "auto") {
    if (aceStepReady) primary = "ace_step";
    else if (elevenLabsConfigured) primary = "elevenlabs";
  } else if (provider === "ace_step" && !aceStepReady) {
    primary = elevenLabsConfigured ? "elevenlabs" : "epidemic_upload";
  } else if (provider === "elevenlabs" && !elevenLabsConfigured) {
    primary = aceStepReady ? "ace_step" : "epidemic_upload";
  }

  return {
    provider,
    primary,
    aceStepReady,
    aceStepComputeMode,
    elevenLabsConfigured,
  };
}

export async function isElevenLabsConfigured(): Promise<boolean> {
  const musicKey = await getSetting("music_api_key");
  const legacyKey = await getSetting("elevenlabs_api_key");
  const envKey =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.MUSIC_API_KEY?.trim() ||
    "";
  return Boolean(musicKey?.trim() || legacyKey?.trim() || envKey);
}

/**
 * Dialog needs real text-to-speech. ACE-Step is text-to-music (vocals sound sung or musical).
 * Prefer ElevenLabs when configured; otherwise local Edge TTS (Python edge-tts).
 */
export interface DialogSpeechSourceStatus {
  primary: "elevenlabs_tts" | "edge_tts" | "none";
  edgeTtsReady: boolean;
  elevenLabsConfigured: boolean;
  edgeTtsVoice: string;
}

export async function getDialogSpeechSourceStatus(): Promise<DialogSpeechSourceStatus> {
  const elevenLabsConfigured = await isElevenLabsConfigured();
  const edgeTtsReady = await isEdgeTtsVoiceoverReady();
  const edgeTtsVoice = (await getDialogEdgeTtsVoice()) || DEFAULT_DIALOG_EDGE_TTS_VOICE;

  let primary: DialogSpeechSourceStatus["primary"] = "none";
  if (elevenLabsConfigured) primary = "elevenlabs_tts";
  else if (edgeTtsReady) primary = "edge_tts";

  return {
    primary,
    edgeTtsReady,
    elevenLabsConfigured,
    edgeTtsVoice,
  };
}

export async function resolveVoiceoverGenerationProvider(): Promise<
  "elevenlabs" | "edge_tts"
> {
  if (await isElevenLabsConfigured()) {
    return "elevenlabs";
  }
  if (await isEdgeTtsVoiceoverReady()) {
    return "edge_tts";
  }
  throw new Error(
    "No dialog speech engine ready. Run: pip install edge-tts, add ElevenLabs in Settings, or upload a voice over file."
  );
}

/** SFX prefers ElevenLabs sound generation; ACE-Step is music-first and often produces noise. */
export async function resolveSfxGenerationProvider(): Promise<
  "ace_step" | "elevenlabs"
> {
  if (await isElevenLabsConfigured()) {
    return "elevenlabs";
  }

  const aceStepReady = await isAceStepGenerationReady();
  if (aceStepReady) {
    return "ace_step";
  }

  throw new Error(
    "No sound effect generator configured. Add ElevenLabs in Settings for best SFX quality, or set up ACE-Step for score and SFX fallback."
  );
}

export async function resolveScoreGenerationProvider(): Promise<
  "ace_step" | "elevenlabs"
> {
  const status = await getScoreAudioSourceStatus();

  if (status.provider === "upload") {
    throw new Error(
      "Score generation is set to Upload. Use Upload score file on Finishing, or change the provider in Settings."
    );
  }

  if (status.provider === "ace_step") {
    if (!status.aceStepReady) {
      throw new Error(
        status.aceStepComputeMode === "remote"
          ? "Remote ACE-Step is not reachable. Set the LAN server URL in App Settings and start the ACE-Step API on that machine."
          : "ACE-Step is not installed locally. Open System Status and run the ACE-Step install script, then set the install folder in App Settings if needed."
      );
    }
    return "ace_step";
  }

  if (status.provider === "elevenlabs") {
    if (!status.elevenLabsConfigured) {
      throw new Error(
        "No ElevenLabs key configured. Add one in Settings, switch to ACE-Step, or upload your own score on Finishing."
      );
    }
    return "elevenlabs";
  }

  if (status.aceStepReady) return "ace_step";
  if (status.elevenLabsConfigured) return "elevenlabs";

  throw new Error(
    "No score generator configured. Install local ACE-Step, point Settings at a remote ACE-Step server, add ElevenLabs, or upload your own score on Finishing."
  );
}
