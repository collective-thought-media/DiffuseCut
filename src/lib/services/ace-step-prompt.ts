import { extractSfxCueFromBrief } from "@/lib/services/sfx-prompt";

export type AceStepMusicPrompt = {
  tags: string;
  lyrics: string;
  bpm: number;
  keyscale: string;
};

export { extractSfxCueFromBrief };

const DEFAULT_BPM = 90;
const DEFAULT_KEY = "A minor";
const MAX_TAG_CHARS = 800;

function clampBpm(value: number): number {
  return Math.min(200, Math.max(40, value));
}

export function inferAceStepBpm(brief: string): number {
  const bpmMatch = brief.match(/\b(\d{2,3})\s*bpm\b/i);
  if (bpmMatch) {
    return clampBpm(Number.parseInt(bpmMatch[1], 10));
  }
  return DEFAULT_BPM;
}

export function inferAceStepKey(brief: string): string {
  const keyMatch = brief.match(/\b([A-G](?:#|b)?)\s*(major|minor)\b/i);
  if (keyMatch) {
    return `${keyMatch[1]} ${keyMatch[2].toLowerCase()}`;
  }
  return DEFAULT_KEY;
}

const SECTION_MARKER = /\[(intro|verse|pre-chorus|chorus|bridge|inst|build-up|drop|breakdown|outro)\]/i;

export function extractAceStepStructureLyrics(brief: string): string {
  if (!SECTION_MARKER.test(brief)) {
    return "";
  }

  const lines = brief.split(/\r?\n/);
  const structureLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (structureLines.length > 0 && structureLines[structureLines.length - 1] !== "") {
        structureLines.push("");
      }
      continue;
    }
    if (SECTION_MARKER.test(trimmed)) {
      structureLines.push(trimmed.toLowerCase());
      continue;
    }
    if (structureLines.length > 0) {
      structureLines.push(trimmed);
    }
  }

  return structureLines.join("\n").trim();
}

export function buildAceStepStyleTags(brief: string, bpm: number): string {
  const trimmed = brief.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  const withoutMarkers = trimmed
    .replace(/\[(intro|verse|pre-chorus|chorus|bridge|inst|build-up|drop|breakdown|outro)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  let tags = withoutMarkers.slice(0, MAX_TAG_CHARS).trim();
  const lower = tags.toLowerCase();

  if (!/\bno vocals?\b/.test(lower) && !/\binstrumental\b/.test(lower)) {
    tags = `${tags}, instrumental, no vocals`.trim().replace(/^,\s*/, "");
  }
  if (!/\bbpm\b/.test(lower)) {
    tags = `${tags}, ${bpm} bpm`;
  }

  return tags;
}

export function buildAceStepMusicPrompt(
  brief: string,
  durationSeconds: number
): AceStepMusicPrompt {
  const trimmed = brief.trim();
  const bpm = inferAceStepBpm(trimmed);
  const keyscale = inferAceStepKey(trimmed);
  const structureLyrics = extractAceStepStructureLyrics(trimmed);

  let tags = buildAceStepStyleTags(trimmed, bpm);
  const roundedDuration = Math.round(Math.max(1, durationSeconds));
  if (roundedDuration >= 10 && !/\b\d+\s*second/.test(tags.toLowerCase())) {
    tags = `${tags}, ${roundedDuration} second continuous cinematic score`;
  }

  return {
    tags,
    lyrics: structureLyrics,
    bpm,
    keyscale,
  };
}

export function buildElevenLabsSfxPrompt(brief: string): string {
  const cue = extractSfxCueFromBrief(brief);
  return cue.slice(0, 220);
}

export function buildAceStepSfxPrompt(brief: string): {
  tags: string;
  lyrics: string;
} {
  const cue = extractSfxCueFromBrief(brief);
  return {
    tags: `ambient foley texture, ${cue}, continuous environmental sound, no music, no melody, no beat, no vocals, no static noise`,
    lyrics: "",
  };
}

export function resolveAceStepSourceDuration(
  kind: "music" | "voiceover" | "sfx",
  durationSeconds: number
): number {
  if (kind === "sfx") {
    return Math.min(22, Math.max(8, durationSeconds));
  }
  if (kind === "voiceover") {
    return Math.min(60, Math.max(1, durationSeconds));
  }
  return Math.min(180, Math.max(1, durationSeconds));
}

export function aceStepPromptForKind(
  kind: "music" | "voiceover" | "sfx",
  prompt: string,
  durationSeconds: number
): Pick<AceStepMusicPrompt, "tags" | "lyrics"> & {
  bpm?: number;
  keyscale?: string;
} {
  const trimmed = prompt.trim();

  if (kind === "voiceover") {
    return {
      tags: "spoken word voiceover, dry studio recording, no music bed",
      lyrics: trimmed,
    };
  }

  if (kind === "sfx") {
    return buildAceStepSfxPrompt(trimmed);
  }

  return buildAceStepMusicPrompt(trimmed, durationSeconds);
}
