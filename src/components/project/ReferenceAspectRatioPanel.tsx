"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_REFERENCE_ASPECT_RATIO,
  REFERENCE_ASPECT_RATIO_PRESETS,
  getReferenceAspectRatioLabel,
  parseReferenceAspectRatio,
  type ReferenceAspectRatioPreset,
} from "@/lib/services/reference-aspect-ratio";
import type { RenderSettings } from "@/types";
import { Label, Badge } from "@/components/ui/button";

const PRESET_ORDER: ReferenceAspectRatioPreset[] = [
  "16_9",
  "9_16",
  "21_9",
  "2_1",
  "1_1",
];

interface ReferenceAspectRatioPanelProps {
  projectId: string;
}

export function ReferenceAspectRatioPanel({
  projectId,
}: ReferenceAspectRatioPanelProps) {
  const [preset, setPreset] = useState<ReferenceAspectRatioPreset>(
    DEFAULT_REFERENCE_ASPECT_RATIO
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/render-settings`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load render settings");
      const settings = (data.renderSettings ?? {}) as RenderSettings;
      setPreset(parseReferenceAspectRatio(settings.referenceAspectRatio));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [projectId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const savePreset = useCallback(
    async (nextPreset: ReferenceAspectRatioPreset) => {
      setSaving(true);
      setSaved(false);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/render-settings`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load render settings");
        const existing = (data.renderSettings ?? {}) as RenderSettings;

        const saveRes = await fetch(`/api/projects/${projectId}/render-settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            renderSettings: {
              ...existing,
              referenceAspectRatio: nextPreset,
            },
          }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(saveData.error ?? "Failed to save reference aspect ratio");
        }
        setPreset(
          parseReferenceAspectRatio(saveData.renderSettings?.referenceAspectRatio)
        );
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [projectId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="entity-card-header">Reference Aspect Ratio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every character sheet and location reference option in this project
            uses the same canvas size.
          </p>
        </div>
        {saving ? (
          <Badge variant="warning">Saving…</Badge>
        ) : saved ? (
          <Badge variant="success">Saved</Badge>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Reference aspect ratio</legend>
        {PRESET_ORDER.map((id) => {
          const def = REFERENCE_ASPECT_RATIO_PRESETS[id];
          const checked = preset === id;
          return (
            <label
              key={id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                checked
                  ? "border-neutral-700 bg-[#1e1e1e]"
                  : "border-neutral-800/40 hover:border-neutral-800 hover:bg-neutral-950/50"
              }`}
            >
              <input
                type="radio"
                name="reference-aspect-ratio"
                value={id}
                checked={checked}
                onChange={() => {
                  setPreset(id);
                  void savePreset(id);
                }}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{def.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {def.width}×{def.height}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {def.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Active: {getReferenceAspectRatioLabel(preset)}
      </p>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ReferenceAspectRatioBadge({
  preset,
}: {
  preset?: ReferenceAspectRatioPreset | null;
}) {
  return (
    <Badge variant="default" className="text-[10px]">
      {getReferenceAspectRatioLabel(preset)}
    </Badge>
  );
}
