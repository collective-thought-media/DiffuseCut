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
    expect(buildStateIdentityContext(jasmine, look).toLowerCase()).not.toContain(
      "blue dragon"
    );
    expect(buildStateIdentityContext(jasmine, look)).toContain("Jasmine");

    const context = buildShotPlaceholderContextFromData({
      prompt: "Jasmine in the lair",
      cast: [{ character: jasmine, state: look }],
      preferCharacterIdentityOverLook: true,
    });
    expect(context.toLowerCase()).not.toContain("redhead");
    expect(context.toLowerCase()).not.toContain("blue dragon");
    expect(context).toContain("Jasmine");
  });

  it("moves no-redhead look phrases out of look context positives", () => {
    const jasmine = character({
      id: "c1",
      name: "Jasmine",
      description: "blue dragon",
    });
    const look = state({
      id: "s1",
      characterId: "c1",
      lookDescription:
        "full anthropomorphic blue dragon, no redhead, no human face",
    });
    const ctx = buildStateLookContext(jasmine, look).toLowerCase();
    expect(ctx).toContain("blue dragon");
    expect(ctx).not.toContain("no redhead");
    expect(ctx).not.toContain("no human face");
  });
});
