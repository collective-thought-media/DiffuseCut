"use client";

import type { Character, CharacterState } from "@/lib/db/schema";
import type { ShotCharacterCastEntry } from "@/lib/services/shot-cast";
import { Label, Select } from "@/components/ui/button";

type CharacterWithStates = Character & { states: CharacterState[] };

export function ShotCastEditor({
  characters,
  characterCast,
  onChange,
}: {
  characters: CharacterWithStates[];
  characterCast: ShotCharacterCastEntry[];
  onChange: (cast: ShotCharacterCastEntry[]) => void;
}) {
  function isInCast(characterId: string) {
    return characterCast.some((entry) => entry.characterId === characterId);
  }

  function getStateId(characterId: string) {
    return (
      characterCast.find((entry) => entry.characterId === characterId)
        ?.characterStateId ?? ""
    );
  }

  function toggleCharacter(characterId: string, enabled: boolean) {
    if (enabled) {
      const character = characters.find((item) => item.id === characterId);
      const defaultStateId = character?.states[0]?.id ?? null;
      onChange([
        ...characterCast,
        { characterId, characterStateId: defaultStateId },
      ]);
      return;
    }
    onChange(characterCast.filter((entry) => entry.characterId !== characterId));
  }

  function setState(characterId: string, characterStateId: string) {
    onChange(
      characterCast.map((entry) =>
        entry.characterId === characterId
          ? { ...entry, characterStateId: characterStateId || null }
          : entry
      )
    );
  }

  if (characters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add characters first, then assign their visual state per shot.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Characters in this shot</Label>
        <p className="text-xs text-muted-foreground">
          Selected characters are written into the generation prompt. Auto or
          Integrate in scene paints them into the saved location plate. Dual
          reference blends both pictures across the whole frame, so a studio
          character sheet can keep its empty background.
        </p>
      </div>
      {characters.map((character) => {
        const checked = isInCast(character.id);
        return (
          <div
            key={character.id}
            className="space-y-2 rounded-lg bg-black p-3"
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  toggleCharacter(character.id, e.target.checked)
                }
              />
              <span className="font-medium">{character.name}</span>
            </label>
            {checked && (
              <div className="space-y-1.5 pl-6">
                <Label htmlFor={`shot-state-${character.id}`}>Visual state</Label>
                <Select
                  id={`shot-state-${character.id}`}
                  value={getStateId(character.id)}
                  onChange={(e) => setState(character.id, e.target.value)}
                >
                  {character.states.map((state) => (
                    <option key={state.id} value={state.id}>
                      {state.name}
                      {state.timelineNote ? ` (${state.timelineNote})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
