import { describe, expect, it } from "vitest";
import {
  buildStateIdentityContext,
  buildStateLookContext,
} from "@/lib/services/character-look-context";
import { buildShotPlaceholderContextFromData } from "@/lib/services/shot-placeholder-description";
import type { Character, CharacterState } from "@/lib/db/schema";

function character(
  partial: Partial<Character> & Pick<Character, "id" | "name">
): Character {
  return {
    projectId: "p1",
    description: "",
    referencePath: null,
    referenceKind: null,
    referenceSource: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  } as Character;
}

function state(
  partial: Partial<CharacterState> & Pick<CharacterState, "id" | "characterId">
): CharacterState {
  return {
    name: "Default look",
    lookDescription: "",
    timelineNote: "",
    referencePath: null,
    referenceKind: null,
    referenceSource: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  } as CharacterState;
}

describe("shot cast identity vs look", () => {
  it("keeps stale redhead look text out when a character reference image is used", () => {
    const jasmine = character({
      id: "c1",
      name: "Jasmine",
      description: "full blue dragon with cream underbelly",
    });
    const look = state({
      id: "s1",
      characterId: "c1",
      lookDescription:
        "redhead humanoid woman in a sparkly blue dress, elf ears",
    });

    expect(buildStateLookContext(jasmine, look).toLowerCase()).toContain(
      "redhead"
    );
    expect(buildStateIdentityContext(jasmine, look).toLowerCase()).not.toContain(
      "redhead"
    );
    expect(buildStateIdentityContext(jasmine, look).toLowerCase()).toContain(
      "blue dragon"
    );

    const context = buildShotPlaceholderContextFromData({
      prompt: "Jasmine in the lair",
      cast: [{ character: jasmine, state: look }],
      preferCharacterIdentityOverLook: true,
    });
    expect(context.toLowerCase()).not.toContain("redhead");
    expect(context.toLowerCase()).toContain("blue dragon");
  });
});
