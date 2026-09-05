import { describe, expect, it } from "vitest";
import type {
  Character,
  CharacterAngle,
  CharacterState,
} from "@/lib/db/schema";
import { resolveShotCharacterReferenceFromCast } from "@/lib/services/shot-reference-core";

function character(partial: Partial<Character> & Pick<Character, "id">): Character {
  return {
    projectId: "p1",
    name: "Hero",
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

function angle(
  partial: Partial<CharacterAngle> & Pick<CharacterAngle, "id" | "characterStateId">
): CharacterAngle {
  return {
    name: "Front full body",
    viewDescription: "",
    referencePath: null,
    referenceKind: null,
    referenceSource: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  } as CharacterAngle;
}

describe("resolveShotCharacterReferenceFromCast", () => {
  it("uses the front angle image when the state still points at an older sheet", () => {
    const hero = character({
      id: "c1",
      referencePath: "characters/c1/old-triptych.png",
      referenceKind: "image",
    });
    const look = state({
      id: "s1",
      characterId: "c1",
      referencePath: "characters/c1/states/s1/old-triptych.png",
      referenceKind: "image",
    });
    const front = angle({
      id: "a1",
      characterStateId: "s1",
      name: "Front full body",
      referencePath: "characters/c1/states/s1/angles/a1/dragon.png",
      referenceKind: "image",
    });

    const resolved = resolveShotCharacterReferenceFromCast([
      { character: hero, state: look, angles: [front] },
    ]);

    expect(resolved.path).toBe(
      "characters/c1/states/s1/angles/a1/dragon.png"
    );
  });
});
