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
  it("uses the newest front angle when an older front still holds the previous sheet", () => {
    const hero = character({ id: "c1" });
    const look = state({ id: "s1", characterId: "c1" });
    const oldFront = angle({
      id: "a-old",
      characterStateId: "s1",
      name: "Front",
      referencePath: "characters/c1/states/s1/angles/a-old/redhead.png",
      referenceKind: "image",
      updatedAt: 10,
    });
    const newFront = angle({
      id: "a-new",
      characterStateId: "s1",
      name: "Front full body",
      referencePath: "characters/c1/states/s1/angles/a-new/dragon.png",
      referenceKind: "image",
      updatedAt: 99,
    });

    const resolved = resolveShotCharacterReferenceFromCast([
      { character: hero, state: look, angles: [oldFront, newFront] },
    ]);

    expect(resolved.path).toBe(
      "characters/c1/states/s1/angles/a-new/dragon.png"
    );
  });

  it("uses nested state.angles when the cast entry omits a top-level angles array", () => {
    const hero = character({
      id: "c1",
      referencePath: "characters/c1/legacy-redhead.png",
    });
    const look = {
      ...state({
        id: "s1",
        characterId: "c1",
        referencePath: "characters/c1/states/s1/legacy-redhead.png",
        referenceKind: "image",
      }),
      angles: [
        angle({
          id: "a-new",
          characterStateId: "s1",
          name: "Front full body",
          referencePath: "characters/c1/states/s1/angles/a-new/dragon.png",
          referenceKind: "image",
          updatedAt: 99,
        }),
      ],
    };

    const resolved = resolveShotCharacterReferenceFromCast([
      { character: hero, state: look },
    ]);

    expect(resolved.path).toBe(
      "characters/c1/states/s1/angles/a-new/dragon.png"
    );
  });
});
