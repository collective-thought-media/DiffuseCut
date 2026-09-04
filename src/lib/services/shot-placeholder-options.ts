import type { Character, CharacterState, Shot } from "@/lib/db/schema";
import { buildWardrobeLockDirective } from "@/lib/services/character-look-context";

export function shotReferenceFocus(
  shot: Pick<Shot, "visualReferenceFocus">
): "character" | "location" {
  return shot.visualReferenceFocus === "character" ? "character" : "location";
}

export function buildShotWardrobeLock(
  cast: Array<{ character: Character; state: CharacterState }>,
  referenceFocus: "character" | "location"
): string | null {
  if (referenceFocus !== "character" || cast.length === 0) return null;
  return buildWardrobeLockDirective(cast);
}
