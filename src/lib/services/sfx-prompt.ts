/** Cues that should survive trimming when present in a longer brief. */
const SALIENT_CUE_PATTERN =
  /\b(lightning|thunder|explosion|gunshot|scream|crash|impact|strike|clap|crack|discharge|metal clash|door|creak|footstep|wing flap|fire crackle|ember|wind gust|wave crash|stone crumble|shatter)\b/i;

function stripSuggestTemplate(brief: string): string {
  let cue = brief.trim();
  cue = cue.replace(/^Realistic cinematic sound design for [^.]+\.\s*/i, "");
  cue = cue.replace(/^Sound for:[^.]+\.\s*/i, "");
  cue = cue.replace(/\bCues:\s*/i, "");
  cue = cue.replace(/\bOn screen:\s*/i, "");
  cue = cue.replace(/\s*Scene context:.*$/i, "");
  cue = cue.replace(/\s*Foley and ambience only[^.]*\.?\s*$/i, "");
  cue = cue.replace(/\s*Foley only[^.]*\.?\s*$/i, "");
  cue = cue.replace(/\s*No music[^.]*\.?\s*$/gi, "");
  return cue.replace(/\s+/g, " ").trim();
}

function selectCueParts(parts: string[], maxParts = 3): string[] {
  if (parts.length <= maxParts) return parts;

  const salient = parts.filter((part) => SALIENT_CUE_PATTERN.test(part));
  const ambient = parts.filter((part) => !SALIENT_CUE_PATTERN.test(part));

  const selected: string[] = [];
  for (const part of salient) {
    if (selected.length >= maxParts) break;
    if (!selected.includes(part)) selected.push(part);
  }
  for (const part of ambient) {
    if (selected.length >= maxParts) break;
    if (!selected.includes(part)) selected.push(part);
  }

  return selected.length > 0 ? selected : parts.slice(0, maxParts);
}

/** Strip suggest-template wording; keep salient on-screen cues when trimming. */
export function extractSfxCueFromBrief(brief: string): string {
  const cuesMatch = brief.match(/\bCues:\s*([^.]+)\./i);
  const onScreenMatch = brief.match(/\bOn screen:\s*([^.]+)\./i);
  if (cuesMatch) {
    const parts = [cuesMatch[1]!.trim()];
    if (onScreenMatch) parts.push(onScreenMatch[1]!.trim());
    return parts.join(", ").slice(0, 220);
  }

  const cue = stripSuggestTemplate(brief);

  const parts = cue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return brief.replace(/\s+/g, " ").trim().slice(0, 220);
  }

  return selectCueParts(parts, 3).join(", ").slice(0, 220);
}

export function buildElevenLabsSfxPrompt(brief: string): string {
  return extractSfxCueFromBrief(brief);
}

/** Woosh works best with action + material + acoustic context, not music language. */
export function buildWooshSfxPrompt(brief: string): string {
  const cue = extractSfxCueFromBrief(brief)
    .replace(/\bno music\b/gi, "")
    .replace(/\bno melody\b/gi, "")
    .replace(/\bno vocals\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cue) {
    return "soft environmental room tone, indoor air, subtle ambience";
  }

  return cue.slice(0, 220);
}

export function resolveSfxGenerationDuration(durationSeconds: number): number {
  return Math.min(22, Math.max(0.5, durationSeconds));
}
