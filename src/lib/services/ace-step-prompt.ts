import { extractSfxCueFromBrief } from "@/lib/services/sfx-prompt";
import {
  ACE_STEP_CONTROL_GATE,
  ACE_STEP_CONTROL_GATE_MUSIC_BODY,
  ACE_STEP_PROVEN_DESERT_SCORE_TAGS,
} from "@/lib/services/ace-step-control-gate";

export type AceStepMusicPrompt = {
  tags: string;
  lyrics: string;
  bpm: number;
  keyscale: string;
};

export { extractSfxCueFromBrief, ACE_STEP_PROVEN_DESERT_SCORE_TAGS };

const DEFAULT_BPM = 90;
const CINEMATIC_BPM = 72;
const DEFAULT_KEY = "A minor";
const MAX_TAG_CHARS = 800;

function clampBpm(value: number): number {
  return Math.min(200, Math.max(40, value));
}

const CINEMATIC_HINT =
  /\b(cinematic|orchestral|orchestra|film score|trailer|strings?|string section|rising|tension|tense|moody|dramatic|suspense|soundtrack|violin|cello|brass|woodwind|piano)\b/i;

const ELECTRONIC_HINT =
  /\b(edm|synthwave|electronic|glitch|techno|house|dubstep|trap beat|808)\b/i;

/** Negations like "no EDM" must not count as an electronic brief. */
const ELECTRONIC_NEGATION =
  /\b(no|without|not|avoid|exclude)\s+(edm|synthwave|electronic|glitch|techno|house|dubstep|trap(?:\s+beat)?|808)s?\b/gi;

/** Phrases that make turbo ACE collapse into near-silence on short film cues. */
const SILENCE_PRONE_TAG =
  /\b(sparse|near[- ]silent|barely audible|almost silent|quiet opening|whisper[- ]quiet|dead silence|live orchestral)\b/gi;

const CONTROL_GATE_BODY_PHRASE =
  /\b(orchestral string ensemble|low cello pad|legato violins|rising tension|slow burn|emotional underscore|dynamic crescendo(?: mid cue)?|resolve at the end|instrumental only|no vocals|no singing|no lyrics|continuous energy throughout|hi-fi|wide stereo|cinematic orchestral score)\b/gi;

export function briefLooksElectronic(brief: string): boolean {
  const withoutNegations = brief.replace(ELECTRONIC_NEGATION, " ");
  return ELECTRONIC_HINT.test(withoutNegations);
}

export function briefLooksCinematic(brief: string): boolean {
  return CINEMATIC_HINT.test(brief) && !briefLooksElectronic(brief);
}

export function inferAceStepBpm(brief: string): number {
  const bpmMatch = brief.match(/\b(\d{2,3})\s*bpm\b/i);
  if (bpmMatch) {
    return clampBpm(Number.parseInt(bpmMatch[1], 10));
  }
  if (briefLooksCinematic(brief)) {
    return CINEMATIC_BPM;
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

const SECTION_MARKER =
  /\[(intro|verse|pre-chorus|chorus|bridge|inst|build-up|drop|breakdown|outro)\]/i;

export function extractAceStepStructureLyrics(brief: string): string {
  if (!SECTION_MARKER.test(brief)) {
    return "";
  }

  const lines = brief.split(/\r?\n/);
  const structureLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (
        structureLines.length > 0 &&
        structureLines[structureLines.length - 1] !== ""
      ) {
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

/** @deprecated Control Gate locks lyrics empty; kept for callers/tests. */
export function buildCinematicStructureLyrics(
  _brief: string,
  _durationSeconds: number
): string {
  return ACE_STEP_CONTROL_GATE.lyrics;
}

/**
 * Keep only scene language from the operator brief. The locked Control Gate
 * instrumental body supplies energy and ensemble wording.
 */
export function extractCinematicSceneHead(brief: string): string {
  let head = brief.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  head = head.replace(ELECTRONIC_NEGATION, " ");
  head = head.replace(SILENCE_PRONE_TAG, " ");
  head = head.replace(CONTROL_GATE_BODY_PHRASE, " ");
  head = head.replace(/\b\d{2,3}\s*bpm\b/gi, " ");
  head = head.replace(/\b([A-G](?:#|b)?)\s*(major|minor)\b/gi, " ");
  head = head.replace(
    /\bno\s+(vocals?|singing|lyrics|synth(?:\s+lead)?|edm)\b/gi,
    " "
  );
  head = head
    .replace(/\s+,/g, ",")
    .replace(/,\s+/g, ", ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (head.length > 140) {
    const cut = head.slice(0, 140);
    const lastComma = cut.lastIndexOf(",");
    head = (lastComma > 40 ? cut.slice(0, lastComma) : cut).trim();
  }

  return head || "cinematic film score";
}

function desertAtmosphereExtras(brief: string, head: string): string {
  if (!/\b(desert|sand|dune|amber)\b/i.test(brief)) return "";
  const extras: string[] = [];
  if (!/warm amber atmosphere/i.test(head)) {
    extras.push("warm amber atmosphere");
  }
  if (!/sand and wind/i.test(head)) {
    extras.push("sand and wind texture soft under strings");
  }
  return extras.length ? `, ${extras.join(", ")}` : "";
}

export function buildAceStepStyleTags(brief: string, bpm: number): string {
  const trimmed = brief.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  const withoutMarkers = trimmed
    .replace(
      /\[(intro|verse|pre-chorus|chorus|bridge|inst|build-up|drop|breakdown|outro)\]/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (briefLooksCinematic(brief)) {
    // Already the proven Control Gate string: pass through (normalize spacing).
    if (
      /continuous energy throughout/i.test(withoutMarkers) &&
      /orchestral string ensemble/i.test(withoutMarkers) &&
      /hi-fi/i.test(withoutMarkers)
    ) {
      let tags = withoutMarkers.slice(0, MAX_TAG_CHARS).trim();
      if (!/\bbpm\b/i.test(tags)) tags = `${tags}, ${bpm} bpm`;
      return tags.replace(/\s+,/g, ",").replace(/,\s+/g, ", ").trim();
    }

    const head = extractCinematicSceneHead(withoutMarkers);
    const atmosphere = desertAtmosphereExtras(withoutMarkers, head);
    const tags =
      `${head}${atmosphere}, ${ACE_STEP_CONTROL_GATE_MUSIC_BODY}, ${bpm} bpm`
        .replace(/\s+,/g, ",")
        .replace(/,\s+/g, ", ")
        .trim();
    return tags.slice(0, MAX_TAG_CHARS);
  }

  let tags = withoutMarkers.slice(0, MAX_TAG_CHARS).trim();
  const lower = tags.toLowerCase();
  if (!/\bno vocals?\b/.test(lower) && !/\binstrumental\b/.test(lower)) {
    tags = `${tags}, instrumental, no vocals`.trim().replace(/^,\s*/, "");
  }
  if (!/\bbpm\b/.test(tags.toLowerCase())) {
    tags = `${tags}, ${bpm} bpm`;
  }
  return tags.replace(/\s+,/g, ",").replace(/,\s+/g, ", ").trim();
}

export function buildAceStepMusicPrompt(
  brief: string,
  durationSeconds: number
): AceStepMusicPrompt {
  const trimmed = brief.trim();
  const bpm = inferAceStepBpm(trimmed);
  const keyscale = inferAceStepKey(trimmed);
  const tags = buildAceStepStyleTags(trimmed, bpm);

  void durationSeconds;
  // Locked Control Gate: instrumental scores never send lyrics/structure essays.
  return {
    tags,
    lyrics: ACE_STEP_CONTROL_GATE.lyrics,
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
  const target = Math.max(1, durationSeconds);
  const minMusicSeconds =
    target < ACE_STEP_CONTROL_GATE.minMusicSourceSeconds
      ? Math.max(target, ACE_STEP_CONTROL_GATE.minMusicSourceSeconds)
      : target;
  return Math.min(ACE_STEP_CONTROL_GATE.maxMusicSourceSeconds, minMusicSeconds);
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
      tags:
        "spoken word voiceover, dry studio recording, single narrator, clear speech, no music, no melody, no drums, no beat, no instrumental bed",
      lyrics: trimmed,
    };
  }

  if (kind === "sfx") {
    return buildAceStepSfxPrompt(trimmed);
  }

  return buildAceStepMusicPrompt(trimmed, durationSeconds);
}
