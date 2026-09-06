import type { Character, CharacterState } from "@/lib/db/schema";
import {
  detectDetailMacroShot,
  detectRearViewShot,
} from "@/lib/services/shot-composition";
import { splitPositiveNegationPhrases } from "@/lib/services/prompt-negation-sanitize";

export function buildStateLookContext(
  character: Character,
  state: CharacterState
): string {
  const parts = [character.name.trim()];
  if (state.name.trim()) parts.push(`(${state.name.trim()})`);
  if (state.lookDescription.trim()) {
    const { cleaned } = splitPositiveNegationPhrases(state.lookDescription);
    if (cleaned) parts.push(`: ${cleaned}`);
  }
  if (state.timelineNote.trim()) {
    parts.push(`[${state.timelineNote.trim()}]`);
  }
  return parts.join(" ");
}

/**
 * Shot cast line when a character reference image is already attached.
 * Name and look label only. Description and look text stay out so phrases
 * like "no redhead" cannot activate the forbidden concept in the positive,
 * and the reference image carries likeness instead.
 */
export function buildStateIdentityContext(
  character: Character,
  state: CharacterState
): string {
  const parts = [character.name.trim()];
  if (state.name.trim()) parts.push(`(${state.name.trim()})`);
  return parts.join(" ");
}

function extractLookSections(
  lookDescription: string,
  sectionNames: string[]
): string {
  const blocks = lookDescription.split(/\n\n+/);
  const wanted = new Set(sectionNames.map((name) => name.toLowerCase()));
  return blocks
    .filter((block) => {
      const heading = block.split(":")[0]?.trim().toLowerCase() ?? "";
      return wanted.has(heading);
    })
    .join("\n\n");
}

/** Drop face-forward cast blocks when the shot camera is explicitly from behind. */
export function filterCharacterLookForRearView(
  lookContext: string,
  userPrompt: string
): string {
  if (!detectRearViewShot(userPrompt)) {
    return lookContext;
  }

  const prefixEnd = lookContext.indexOf(": ");
  const prefix = prefixEnd >= 0 ? lookContext.slice(0, prefixEnd) : lookContext;
  const body = prefixEnd >= 0 ? lookContext.slice(prefixEnd + 2) : "";

  if (detectDetailMacroShot(userPrompt) && body) {
    const wingsOnly = extractLookSections(body, ["Wings"]);
    if (wingsOnly.trim()) {
      return `${prefix}: ${wingsOnly}. Macro detail on wings and upper back from behind, face not visible`;
    }
  }

  const filtered = body
    .split(/\n\n+/)
    .filter((block) => {
      const lower = block.toLowerCase();
      return (
        !lower.startsWith("face & head") &&
        !lower.startsWith("wardrobe & armor") &&
        !lower.startsWith("silhouette & posture")
      );
    })
    .join("\n\n");

  return `${prefix}: ${filtered}. Camera from behind, back to camera, face not visible`;
}

const CLOTHING_KEYWORD =
  /\b(dress|outfit|wearing|costume|armor|gown|suit|uniform|robe|skirt|blouse|shirt|jacket|coat|vest|tunic|bodice|wardrobe)\b/i;

/** Pull wardrobe phrases from a state look description for prompt locking. */
export function extractWardrobeFromLookDescription(
  lookDescription: string
): string | null {
  const trimmed = lookDescription.trim();
  if (!trimmed) return null;

  const wardrobeSection = extractLookSections(trimmed, [
    "Wardrobe & armor",
    "Wardrobe",
  ]);
  if (wardrobeSection.trim()) {
    return wardrobeSection.replace(/^[^:]+:\s*/i, "").trim();
  }

  if (!CLOTHING_KEYWORD.test(trimmed)) return null;

  const clauseMatch = trimmed.match(
    /(?:,\s*|\.\s*)([^.,;]+?\b(?:dress|outfit|gown|costume|uniform|robe|skirt|blouse|shirt|jacket|coat|vest|tunic|bodice)\b[^.,;]*)/i
  );
  if (clauseMatch?.[1]?.trim()) {
    return clauseMatch[1].trim();
  }

  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  const clothingSentences = sentences.filter((sentence) =>
    CLOTHING_KEYWORD.test(sentence)
  );
  if (clothingSentences.length > 0) {
    return clothingSentences.join(". ").trim();
  }

  return null;
}

export function buildWardrobeLockDirective(
  cast: Array<{ character: Character; state: CharacterState }>
): string | null {
  const details = cast
    .map(({ character, state }) => {
      const wardrobe = extractWardrobeFromLookDescription(state.lookDescription);
      if (!wardrobe) return null;
      return `${character.name.trim()}: ${wardrobe}`;
    })
    .filter((value): value is string => Boolean(value));

  if (details.length === 0) return null;

  return `Exact same outfit as the character reference image (${details.join("; ")}). Match silhouette, colors, materials, and key costume details. Do not redesign the outfit`;
}
