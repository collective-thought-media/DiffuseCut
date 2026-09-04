import type { Character, CharacterState, Shot } from "@/lib/db/schema";
import { buildWardrobeLockDirective } from "@/lib/services/character-look-context";

export function shotReferenceFocus(
  shot: Pick<Shot, "visualReferenceFocus">
): "character" | "location" {
  return shot.visualReferenceFocus === "character" ? "character" : "location";
}

export function buildShotWardrobeLock(
  cast: Array<{ character: Character; state: CharacterState }>
): string | null {
  if (cast.length === 0) return null;
  return buildWardrobeLockDirective(cast);
}
