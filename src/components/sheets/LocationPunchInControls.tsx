"use client";

import { useState } from "react";
import type { PunchInFocus } from "@/lib/services/image-punch-in";
import { Button, Label, Select } from "@/components/ui/button";

const FOCUS_LABELS: Record<PunchInFocus, string> = {
  center: "Center",
  left: "Left",
  right: "Right",
  upper_center: "Upper center",
  lower_center: "Lower center",
};

const ZOOM_OPTIONS = [
  { value: 1.5, label: "1.5x (mild)" },
  { value: 1.75, label: "1.75x (default)" },
  { value: 2, label: "2x" },
  { value: 2.5, label: "2.5x" },
  { value: 3, label: "3x (tight)" },
];

interface LocationPunchInControlsProps {
  apiBase: string;
  anchorAngleName?: string | null;
  onDone: () => void | Promise<void>;
  disabled?: boolean;
}

export function LocationPunchInControls({
  apiBase,
  anchorAngleName,
  onDone,
  disabled = false,
}: LocationPunchInControlsProps) {
  const [zoom, setZoom] = useState(1.75);
  const [focus, setFocus] = useState<PunchInFocus>("center");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePunchIn() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/punch-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoom, focus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Punch-in failed");
      await Promise.resolve(onDone());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Punch-in failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">
          Punch in from establishing
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Optical crop of{" "}
          {anchorAngleName ? `"${anchorAngleName}"` : "the establishing plate"},
          then scaled back up. Same pixels, tighter framing. No diffusion, so
          the room cannot drift.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="punch-in-zoom">Zoom</Label>
          <Select
            id="punch-in-zoom"
            value={String(zoom)}
            disabled={disabled || working}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {ZOOM_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="punch-in-focus">Focus</Label>
          <Select
            id="punch-in-focus"
            value={focus}
            disabled={disabled || working}
            onChange={(e) => setFocus(e.target.value as PunchInFocus)}
          >
            {(Object.keys(FOCUS_LABELS) as PunchInFocus[]).map((item) => (
              <option key={item} value={item}>
                {FOCUS_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Button
        type="button"
        onClick={() => void handlePunchIn()}
        disabled={disabled || working}
      >
        {working ? "Punching in…" : "Punch in from establishing"}
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
