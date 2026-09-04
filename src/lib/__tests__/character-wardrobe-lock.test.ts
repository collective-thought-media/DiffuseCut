import { describe, expect, it } from "vitest";
import {
  buildWardrobeLockDirective,
  extractWardrobeFromLookDescription,
} from "@/lib/services/character-look-context";
import type { Character, CharacterState } from "@/lib/db/schema";

function state(lookDescription: string): CharacterState {
  return {
    id: "s1",
    characterId: "c1",
    name: "Default look",
    lookDescription,
    timelineNote: "",
    referencePath: null,
    referenceKind: null,
    referenceSource: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

function character(name: string): Character {
  return {
    id: "c1",
    projectId: "p1",
    name,
    description: "",
    referencePath: null,
    referenceKind: null,
    referenceSource: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("character wardrobe lock", () => {
  it("extracts outfit phrases from look descriptions", () => {
    expect(
      extractWardrobeFromLookDescription(
        "woman in her early 30s, blonde hair, light green knee-length dress, natural skin"
      )
    ).toBe("light green knee-length dress");
  });

  it("builds a wardrobe lock directive for cast members", () => {
    const directive = buildWardrobeLockDirective([
      {
        character: character("Alex"),
        state: state(
          "woman in her early 30s, blonde hair, light green knee-length dress, natural skin"
        ),
      },
    ]);
    expect(directive).toContain("Alex");
    expect(directive).toContain("light green knee-length dress");
    expect(directive).toContain("Exact same outfit");
  });
});
