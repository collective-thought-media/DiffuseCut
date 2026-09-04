"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  VISUAL_STYLE_PRESETS,
  getVisualStyleLabel,
  parseVisualStyle,
  type VisualStyle,
  type VisualStylePreset,
} from "@/lib/services/visual-style";
import {
  useDebouncedSave,
  type DebouncedSaveContext,
} from "@/lib/hooks/useDebouncedSave";
import { useSyncedEditableFields } from "@/lib/hooks/useSyncedEditableFields";
import { Label, Textarea, Badge } from "@/components/ui/button";

const PRESET_ORDER: VisualStylePreset[] = [
  "photoreal_cinematic",
  "stylized_illustration",
  "animation_cartoon",
  "custom",
];

interface VisualStylePanelProps {
  projectId: string;
  initialStyleJson?: string | null;
}

export function VisualStylePanel({
  projectId,
  initialStyleJson,
}: VisualStylePanelProps) {
  const initialStyle = useMemo(
    () => parseVisualStyle(initialStyleJson),
    [initialStyleJson]
  );
  const [preset, setPreset] = useState<VisualStylePreset>(initialStyle.preset);

  const customFieldSource = useMemo(
    () => ({ customSuffix: initialStyle.customSuffix ?? "" }),
    [initialStyleJson]
  );
  const { fields, bind } = useSyncedEditableFields(
    customFieldSource,
    `${projectId}:custom-suffix`
  );

  const saveStyle = useCallback(
    async (nextStyle: VisualStyle, ctx: DebouncedSaveContext) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visualStyle: nextStyle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save visual style");
      if (!ctx.isLatest()) return;
      const savedStyle = parseVisualStyle(data.project.visualStyleJson);
      setPreset(savedStyle.preset);
    },
    [projectId]
  );

  const { schedule, flush, saving, saved, error } = useDebouncedSave(saveStyle);

  useEffect(() => {
    setPreset(parseVisualStyle(initialStyleJson).preset);
  }, [initialStyleJson]);

  function selectPreset(nextPreset: VisualStylePreset) {
    setPreset(nextPreset);
    const nextStyle: VisualStyle = { preset: nextPreset };
    if (nextPreset === "custom") {
      nextStyle.customSuffix = fields.customSuffix;
    }
    void flush(nextStyle);
  }

  const style: VisualStyle =
    preset === "custom"
      ? { preset, customSuffix: fields.customSuffix }
      : { preset };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="entity-card-header">Visual Look</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sets the art direction for character sheets and shot renders in this
            project. Choose this before generating characters.
          </p>
        </div>
        {saving ? (
          <Badge variant="warning">Saving…</Badge>
        ) : saved ? (
          <Badge variant="success">Saved</Badge>
        ) : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="sr-only">Visual style preset</legend>
        {PRESET_ORDER.map((presetId) => {
          const presetOption = VISUAL_STYLE_PRESETS[presetId];
          const selected = preset === presetId;
          return (
            <label
              key={presetId}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                selected
                  ? "border-neutral-700 bg-[#1e1e1e]"
                  : "border-neutral-800/40 hover:border-neutral-800 hover:bg-neutral-950/50"
              }`}
            >
              <input
                type="radio"
                name="visual-style"
                value={presetId}
                checked={selected}
                onChange={() => selectPreset(presetId)}
                className="mt-1"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  {presetOption.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {presetOption.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {preset === "custom" && (
        <div className="space-y-1.5">
          <Label htmlFor="custom-style-suffix">Custom style phrase</Label>
          <Textarea
            id="custom-style-suffix"
            {...bind("customSuffix", (next) =>
              schedule({ preset: "custom", customSuffix: next.customSuffix })
            )}
            placeholder="e.g. gritty handheld documentary, desaturated, overcast natural light"
            className="min-h-[80px]"
          />
          <p className="text-xs text-muted-foreground">
            Appended to character sheet and shot prompts for this project.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Active look:{" "}
        <span className="text-foreground">{getVisualStyleLabel(style)}</span>
      </p>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function VisualStyleBadge({ styleJson }: { styleJson?: string | null }) {
  const style = parseVisualStyle(styleJson);
  return (
    <Badge title="Project visual look">
      Look: {getVisualStyleLabel(style)}
    </Badge>
  );
}
