import type { Character, CharacterState, Location } from "@/lib/db/schema";
import {
  buildStateIdentityContext,
  buildStateLookContext,
  filterCharacterLookForRearView,
} from "@/lib/services/character-look-context";
import {
  detectRearViewShot,
  detectWideShot,
} from "@/lib/services/shot-composition";
import { splitPositiveNegationPhrases } from "@/lib/services/prompt-negation-sanitize";

export function collectShotCastNegativeTerms(
  cast?: Array<{ character: Character; state: CharacterState }>
): string[] {
  if (!cast?.length) return [];
  const terms: string[] = [];
  for (const { character, state } of cast) {
    for (const text of [character.description, state.lookDescription]) {
      const { negativeTerms } = splitPositiveNegationPhrases(text ?? "");
      terms.push(...negativeTerms);
    }
  }
  return terms;
}

export function buildShotPlaceholderContextFromData(input: {
  prompt: string;
  location?: Pick<Location, "name" | "description"> | null;
  locationDetail?: string | null;
  cast?: Array<{
    character: Character;
    state: CharacterState;
  }>;
  referenceFocus?: "character" | "location";
  /** When true, cast lines use character identity only (not look description). */
  preferCharacterIdentityOverLook?: boolean;
}): string {
  const parts: string[] = [];

  if (input.locationDetail?.trim()) {
    parts.push(`Location: ${input.locationDetail.trim()}`);
  } else if (input.location) {
    const locationParts: string[] = [];
    if (input.location.name.trim()) {
      locationParts.push(input.location.name.trim());
    }
    if (input.location.description?.trim()) {
      locationParts.push(input.location.description.trim());
    }
    if (locationParts.length > 0) {
      parts.push(`Location: ${locationParts.join(". ")}`);
    }
  }

  if (input.cast?.length) {
    const applyRearFilter =
      input.cast.length === 1 &&
      !detectWideShot(input.prompt) &&
      detectRearViewShot(input.prompt);
    const castParts = input.cast.map(({ character, state }) => {
      const look = input.preferCharacterIdentityOverLook
        ? buildStateIdentityContext(character, state)
        : buildStateLookContext(character, state);
      return applyRearFilter
        ? filterCharacterLookForRearView(look, input.prompt)
        : look;
    });
    parts.push(`Cast: ${castParts.join("; ")}`);
  }

  return parts.join(". ");
}

export function buildShotPlaceholderDescriptionFromData(input: {
  prompt: string;
  location?: Pick<Location, "name" | "description"> | null;
  locationDetail?: string | null;
  cast?: Array<{
    character: Character;
    state: CharacterState;
  }>;
  referenceFocus?: "character" | "location";
  preferCharacterIdentityOverLook?: boolean;
}): string {
  const parts: string[] = [];

  if (input.prompt.trim()) {
    parts.push(input.prompt.trim());
  }

  const context = buildShotPlaceholderContextFromData(input);
  if (context.trim()) {
    parts.push(context);
  }

  return parts.join(". ");
}
