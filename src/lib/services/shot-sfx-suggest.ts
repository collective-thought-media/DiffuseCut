import type { Shot } from "@/lib/db/schema";
import { getSetting } from "@/lib/services/settings";

export interface ShotSfxSuggestion {
  shotId: string;
  shotTitle: string;
  promptText: string;
  usedLlm: boolean;
}

type SfxRuleCategory = "hero" | "weather" | "foley" | "ambient";

interface SfxRule {
  pattern: RegExp;
  phrase: string;
  priority: number;
  category: SfxRuleCategory;
}

const SFX_RULES: SfxRule[] = [
  {
    pattern: /\blightning\b|\blightning flash\b|\belectric (?:arc|bolt|flash)\b/i,
    phrase: "single loud lightning bolt strike, sharp electric crack, thunder boom",
    priority: 100,
    category: "hero",
  },
  {
    pattern: /\bthunder\b|\bthunderclap\b/i,
    phrase: "thunder clap, deep rumble",
    priority: 95,
    category: "hero",
  },
  {
    pattern: /\bexplosion\b|\bblast\b|\bdetona/i,
    phrase: "explosion impact, debris fall",
    priority: 88,
    category: "hero",
  },
  {
    pattern: /\bsword\b|\bbattle\b|\bfight\b|\bclash\b|\bcombat\b/i,
    phrase: "metal clash, combat impacts",
    priority: 86,
    category: "hero",
  },
  {
    pattern: /\bdoor\b|\bgate\b|\bportcullis\b/i,
    phrase: "heavy door creak, metal latch",
    priority: 84,
    category: "hero",
  },
  {
    pattern: /\bwind\b|\bwinds\b|\bgust\b|\bbreeze\b|\bstorm clouds\b/i,
    phrase: "strong wind gust, air howl",
    priority: 76,
    category: "weather",
  },
  {
    pattern: /\brain\w*\b|\bstorm\b|\bwet\b|\bdrizzle\b|\bdownpour\b|\bheavy rain\b|\brainstorm\b/i,
    phrase: "heavy rain, water hitting surfaces",
    priority: 74,
    category: "weather",
  },
  {
    pattern: /\bfootstep\b|\bwalk\b|\brun\b|\bmarch\b|\bclimb\b|\bstep\b/i,
    phrase: "footsteps on stone, cloth rustle",
    priority: 50,
    category: "foley",
  },
  {
    pattern: /\bwing\b|\bfly\b|\bflight\b|\bflap\b/i,
    phrase: "wing flap, air rush",
    priority: 52,
    category: "foley",
  },
  {
    pattern: /\barmor\b|\brip\b|\btear\b|\bshatter\b|\bbreak\b|\bcrumbl/i,
    phrase: "metal break, stone crumble, debris",
    priority: 48,
    category: "foley",
  },
  {
    pattern: /\bfire\b|\bflame\b|\bburn\b|\bhell\b|\bember\b|\bcrackle\b/i,
    phrase: "fire crackle, ember pops",
    priority: 72,
    category: "ambient",
  },
  {
    pattern: /\bsmoke\b|\bcharcoal\b|\bashen\b|\bwasteland\b/i,
    phrase: "low smoke hiss, ash drift",
    priority: 70,
    category: "ambient",
  },
  {
    pattern: /\bcrowd\b|\bcity\b|\burban\b|\bstreet\b/i,
    phrase: "distant city ambience",
    priority: 68,
    category: "ambient",
  },
  {
    pattern: /\bforest\b|\btree\b|\bleaves\b|\bwood\b/i,
    phrase: "forest rustle, leaf movement",
    priority: 66,
    category: "ambient",
  },
  {
    pattern: /\bocean\b|\bsea\b|\bwave\b|\bbeach\b/i,
    phrase: "ocean waves, coastal spray",
    priority: 64,
    category: "ambient",
  },
  {
    pattern: /\bcave\b|\bcavern\b|\becho\b|\bvoid\b|\bcathedral\b|\bstone stair/i,
    phrase: "stone room tone, hollow reverb",
    priority: 62,
    category: "ambient",
  },
  {
    pattern: /\bwater\b|\briver\b|\bstream\b|\bknee-deep\b|\bpowder\b/i,
    phrase: "water movement, wet ground texture",
    priority: 60,
    category: "ambient",
  },
  {
    pattern: /\bsnow\b|\bcold\b|\bice\b|\bfrost\b/i,
    phrase: "cold wind, icy ambience",
    priority: 58,
    category: "ambient",
  },
  {
    pattern: /\bchoir\b|\bchoral\b|\bethereal\b|\bbeam of light\b|\bgod ray\b/i,
    phrase: "soft airy atmosphere, light bloom air",
    priority: 56,
    category: "ambient",
  },
];

interface MatchedCue {
  phrase: string;
  priority: number;
  order: number;
  category: SfxRuleCategory;
}

function matchCues(source: string): MatchedCue[] {
  const matched: MatchedCue[] = [];

  for (let order = 0; order < SFX_RULES.length; order += 1) {
    const rule = SFX_RULES[order]!;
    if (rule.pattern.test(source)) {
      matched.push({
        phrase: rule.phrase,
        priority: rule.priority,
        order,
        category: rule.category,
      });
    }
  }

  matched.sort((a, b) => b.priority - a.priority || a.order - b.order);
  return matched;
}

function uniquePhrases(rows: MatchedCue[], limit: number): string[] {
  const unique: string[] = [];
  for (const row of rows) {
    if (!unique.includes(row.phrase)) unique.push(row.phrase);
    if (unique.length >= limit) break;
  }
  return unique;
}

/** Brief cues for UI: hero + weather + one supporting layer. */
export function extractAudioCuesFromShotText(source: string): string[] {
  return rankMatchedCues(source);
}

function rankMatchedCues(source: string): string[] {
  const matched = matchCues(source);
  const heroes = matched.filter((row) => row.category === "hero");
  const weather = matched.filter((row) => row.category === "weather");
  const support = matched.filter(
    (row) => row.category === "foley" || row.category === "ambient"
  );

  const brief: string[] = [];
  if (heroes[0]) brief.push(heroes[0].phrase);
  if (weather[0] && !brief.includes(weather[0].phrase)) {
    brief.push(weather[0].phrase);
  }
  for (const row of support) {
    if (brief.length >= 3) break;
    if (!brief.includes(row.phrase)) brief.push(row.phrase);
  }

  return brief.length > 0 ? brief : ["subtle environmental room tone"];
}

export function extractSceneAnchorFromShot(shot: Shot): string {
  let text = shot.prompt.trim().replace(/\s+/g, " ");
  text = text.replace(
    /^A cinematic (?:wide|medium|close(?:-up)?|low-angle|high-angle|tracking|establishing) shot of?\s+/i,
    ""
  );
  const sentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return sentence.slice(0, 140).trim();
}

export function buildSfxPromptFromShot(shot: Shot, index = 0): string {
  const source = `${shot.title} ${shot.prompt}`.trim();
  const cueLine = rankMatchedCues(source).join(", ");
  const shotLabel = shot.title?.trim() || `Shot ${index + 1}`;
  const anchor = extractSceneAnchorFromShot(shot);

  if (anchor) {
    return `Sound for: ${shotLabel}. Cues: ${cueLine}. On screen: ${anchor}. Foley only, no music, no vocals.`;
  }

  return `Sound for: ${shotLabel}. Cues: ${cueLine}. Foley only, no music, no vocals.`;
}

export function buildWooshPromptFromShot(shot: Shot, _index = 0): string {
  const source = `${shot.title} ${shot.prompt}`.trim();
  const matched = matchCues(source);
  const heroes = matched.filter((row) => row.category === "hero");
  const weather = matched.filter((row) => row.category === "weather");
  const parts: string[] = [];

  if (heroes[0]) {
    parts.push(heroes[0].phrase);
    const weatherPhrases = uniquePhrases(weather, 2);
    for (const phrase of weatherPhrases) {
      parts.push(`${phrase}, background ambience`);
    }
  } else if (weather[0]) {
    parts.push(weather[0].phrase);
  }
  if (parts.length === 0) {
    parts.push(...uniquePhrases(matched, 2));
  }
  if (parts.length === 0) {
    parts.push("subtle environmental room tone");
  }

  if (/\blightning\b/i.test(source)) {
    parts.push("outdoor storm, sudden bright flash");
  }

  return parts.join(", ").slice(0, 220);
}

export const LIGHTNING_STRIKE_WOOSH_PROMPT =
  "sharp lightning crack, loud electric zap, thunder clap impact, cinematic sfx";

/** Ambience bed without the hero strike (rain, wind, room tone). */
export function buildWooshBedPromptFromShot(shot: Shot, _index = 0): string {
  const source = `${shot.title} ${shot.prompt}`.trim();
  const matched = matchCues(source);
  const weather = matched.filter((row) => row.category === "weather");
  const ambient = matched.filter((row) => row.category === "ambient");
  const parts: string[] = [];

  for (const row of uniquePhrases(weather, 2)) {
    parts.push(row);
  }
  for (const row of uniquePhrases(ambient, 1)) {
    if (!parts.includes(row)) parts.push(row);
  }

  if (parts.length === 0) {
    parts.push("subtle outdoor storm ambience, distant air movement");
  }

  return parts.join(", ").slice(0, 220);
}

export function shotNeedsLightningStrikeLayer(source: string): boolean {
  return /\blightning\b|\blightning flash\b|\belectric (?:arc|bolt|flash)\b/i.test(
    source
  );
}

function ruleBasedSfxPrompt(shot: Shot, index: number): string {
  return buildSfxPromptFromShot(shot, index);
}

async function llmSuggestSfxForShots(
  shots: Shot[]
): Promise<ShotSfxSuggestion[] | null> {
  const enabled = (await getSetting("llm_prompt_expand_enabled")) === "true";
  const provider = (await getSetting("llm_provider")) ?? "none";
  if (!enabled || provider === "none") return null;

  const shotLines = shots
    .map(
      (shot, index) =>
        `${index + 1}. id=${shot.id} title=${JSON.stringify(shot.title || `Shot ${index + 1}`)} prompt=${JSON.stringify(shot.prompt.trim())}`
    )
    .join("\n");

  const systemPrompt =
    "You write realistic sound-effect briefs that match what is visible on screen in each film shot. " +
    "If the shot shows lightning, the primary cue must be a lightning bolt strike sound. " +
    "If it shows rain, include rain as supporting ambience. " +
    "Match dramatic visible events first, then supporting ambience. " +
    "Output 1 to 3 comma-separated concrete foley or ambience cues (no music, no dialog). " +
    'Return JSON array: [{"shotId":"...","promptText":"..."}]. ' +
    "Keep each prompt under 180 characters.";

  const userMessage = `Suggest sound effects for these shots:\n${shotLines}`;

  try {
    if (provider === "ollama") {
      const apiUrl =
        (await getSetting("llm_api_url")) ?? "http://127.0.0.1:11434";
      const model = (await getSetting("llm_model")) ?? "llama3.2";
      const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: `${systemPrompt}\n\n${userMessage}`,
          stream: false,
          format: "json",
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { response?: string };
      return parseLlmSuggestions(data.response ?? "", shots);
    }

    if (provider === "openai") {
      const apiKey = await getSetting("llm_api_key");
      if (!apiKey) return null;
      const model = (await getSetting("llm_model")) ?? "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1200,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return parseLlmSuggestions(
        data.choices?.[0]?.message?.content ?? "",
        shots
      );
    }
  } catch {
    return null;
  }

  return null;
}

function parseLlmSuggestions(
  raw: string,
  shots: Shot[]
): ShotSfxSuggestion[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return null;
    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      return null;
    }
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as { suggestions?: unknown }).suggestions)
      ? (parsed as { suggestions: unknown[] }).suggestions
      : null;

  if (!rows) return null;

  const byId = new Map<string, string>();
  for (const row of rows) {
    if (
      row &&
      typeof row === "object" &&
      "shotId" in row &&
      "promptText" in row &&
      typeof (row as { shotId: unknown }).shotId === "string" &&
      typeof (row as { promptText: unknown }).promptText === "string"
    ) {
      byId.set(
        (row as { shotId: string }).shotId,
        (row as { promptText: string }).promptText.trim()
      );
    }
  }

  if (byId.size === 0) return null;

  return shots.map((shot, index) => ({
    shotId: shot.id,
    shotTitle: shot.title?.trim() || `Shot ${index + 1}`,
    promptText: byId.get(shot.id) ?? ruleBasedSfxPrompt(shot, index),
    usedLlm: byId.has(shot.id),
  }));
}

export async function suggestSfxForShots(
  shots: Shot[]
): Promise<ShotSfxSuggestion[]> {
  if (shots.length === 0) return [];

  const llmResult = await llmSuggestSfxForShots(shots);
  if (llmResult) return llmResult;

  return shots.map((shot, index) => ({
    shotId: shot.id,
    shotTitle: shot.title?.trim() || `Shot ${index + 1}`,
    promptText: ruleBasedSfxPrompt(shot, index),
    usedLlm: false,
  }));
}

export function buildRuleBasedSfxPrompt(shot: Shot, index: number): string {
  return buildSfxPromptFromShot(shot, index);
}
