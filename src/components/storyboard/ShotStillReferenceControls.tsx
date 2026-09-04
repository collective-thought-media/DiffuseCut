"use client";

import type { ShotStillReferenceMode } from "@/lib/services/shot-still-reference-mode";
import { Label, Select } from "@/components/ui/button";

const MODE_LABELS: Record<ShotStillReferenceMode, string> = {
  auto: "Auto (dual when both references exist)",
  dual: "Character and location (dual IP-Adapter)",
  character: "Character reference only",
  location: "Location reference only",
  prompt_only: "Prompt only (no reference image)",
};

interface ShotStillReferenceControlsProps {
  mode: ShotStillReferenceMode;
  availableModes: ShotStillReferenceMode[];
  characterName?: string | null;
  locationLabel?: string | null;
  onChange: (mode: ShotStillReferenceMode) => void;
  disabled?: boolean;
}

export function ShotStillReferenceControls({
  mode,
  availableModes,
  characterName,
  locationLabel,
  onChange,
  disabled = false,
}: ShotStillReferenceControlsProps) {
  if (availableModes.length <= 1) return null;

  const options = availableModes.filter(
    (item) => item !== "dual" || availableModes.includes("dual")
  );

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Visual reference</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose which saved reference art to send to ComfyUI for this shot.
          Character references lock face and wardrobe. Location references steer
          background and set lighting. Your shot prompt still drives framing and
          action.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="shot-still-reference-mode">Reference mode</Label>
        <Select
          id="shot-still-reference-mode"
          value={mode}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.value as ShotStillReferenceMode)
          }
        >
          {options.map((item) => (
            <option key={item} value={item}>
              {MODE_LABELS[item]}
            </option>
          ))}
        </Select>
      </div>

      {mode === "character" && characterName ? (
        <p className="text-xs text-muted-foreground">
          Uses {characterName}&apos;s character sheet only.
        </p>
      ) : null}
      {mode === "location" && locationLabel ? (
        <p className="text-xs text-muted-foreground">
          Uses location reference only ({locationLabel}).
        </p>
      ) : null}
      {mode === "prompt_only" ? (
        <p className="text-xs text-muted-foreground">
          No reference image is sent. Cast look descriptions and your shot prompt
          carry the visual direction.
        </p>
      ) : null}
    </div>
  );
}
