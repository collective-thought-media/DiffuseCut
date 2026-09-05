"use client";



import { useEffect, useState } from "react";

import {

  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,

  BUILTIN_KREA2_STILL_TEMPLATE_ID,

} from "@/lib/db/builtin-template-ids";

import type { RenderSettings } from "@/types";

import { Label, Select } from "@/components/ui/button";

import {

  IMAGE_ENGINE_KREA2,

  isKrea2ImageEngine,

  shortCheckpointLabel,

} from "@/lib/services/image-checkpoints";

import { cn } from "@/lib/utils";



interface ImageModelPickerProps {

  projectId: string;

  checkpoints: string[];

  value: string;

  imageEngine?: "sdxl" | "krea2";

  krea2Available?: boolean;

  onValueChange?: (checkpoint: string) => void;

  onEngineChange?: (engine: "sdxl" | "krea2") => void;

  onSaved?: (checkpoint: string, engine: "sdxl" | "krea2") => void;

  autoSave?: boolean;

  disabled?: boolean;

  compact?: boolean;

  id?: string;

  className?: string;

}



export function ImageModelPicker({

  projectId,

  checkpoints,

  value,

  imageEngine = "sdxl",

  krea2Available = false,

  onValueChange,

  onEngineChange,

  onSaved,

  autoSave = false,

  disabled = false,

  compact = false,

  id = "image-model",

  className,

}: ImageModelPickerProps) {

  const selectedValue = isKrea2ImageEngine(imageEngine)

    ? IMAGE_ENGINE_KREA2

    : value;

  const [selected, setSelected] = useState(selectedValue);

  const [saving, setSaving] = useState(false);

  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    setSelected(selectedValue);

  }, [selectedValue]);



  async function persistSelection(next: string) {

    setSaving(true);

    setError(null);

    setSavedMessage(null);

    try {

      const settingsRes = await fetch(

        `/api/projects/${projectId}/render-settings`

      );

      const settingsData = await settingsRes.json();

      if (!settingsRes.ok) {

        throw new Error(settingsData.error ?? "Failed to load render settings");

      }

      const existing = (settingsData.renderSettings ?? {}) as RenderSettings;

      const useKrea = next === IMAGE_ENGINE_KREA2;



      const renderSettings: RenderSettings = useKrea

        ? {

            ...existing,

            imageEngine: "krea2",

            characterSheetTemplateId: BUILTIN_KREA2_STILL_TEMPLATE_ID,

            imageSampler: {

              steps: 8,

              cfg: 1,

              sampler_name: "euler",

              scheduler: "simple",

              ...existing.imageSampler,

            },

          }

        : {

            ...existing,

            imageEngine: "sdxl",

            checkpoint: next,

            characterSheetTemplateId:

              existing.characterSheetTemplateId === BUILTIN_KREA2_STILL_TEMPLATE_ID

                ? BUILTIN_CHARACTER_SHEET_TEMPLATE_ID

                : existing.characterSheetTemplateId,

          };



      const res = await fetch(`/api/projects/${projectId}/render-settings`, {

        method: "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ renderSettings }),

      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Failed to save image model");



      onSaved?.(useKrea ? IMAGE_ENGINE_KREA2 : next, useKrea ? "krea2" : "sdxl");

      onEngineChange?.(useKrea ? "krea2" : "sdxl");

      setSavedMessage("Saved");

      window.setTimeout(() => setSavedMessage(null), 2000);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Failed to save image model");

    } finally {

      setSaving(false);

    }

  }



  function handleChange(next: string) {

    setSelected(next);

    if (next === IMAGE_ENGINE_KREA2) {

      onValueChange?.(IMAGE_ENGINE_KREA2);

      onEngineChange?.("krea2");

    } else {

      onValueChange?.(next);

      onEngineChange?.("sdxl");

    }

    if (autoSave) {

      void persistSelection(next);

    }

  }



  const hasOptions = checkpoints.length > 0 || krea2Available;



  if (!hasOptions) {

    return (

      <p className={cn("text-sm text-amber-200/90", className)}>

        No image models found on ComfyUI. Add an SDXL checkpoint to

        models/checkpoints, or install krea2_turbo_fp8_scaled in

        models/diffusion_models.

      </p>

    );

  }



  return (

    <div className={cn("space-y-1.5", className)}>

      <div className="flex flex-wrap items-center gap-2">

        <Label

          htmlFor={id}

          className={cn(compact ? "text-xs shrink-0" : undefined)}

        >

          Image model

        </Label>

        {savedMessage && (

          <span className="text-xs text-emerald-400">{savedMessage}</span>

        )}

        {saving && (

          <span className="text-xs text-muted-foreground">Saving…</span>

        )}

      </div>

      <Select

        id={id}

        value={selected}

        disabled={disabled || saving}

        onChange={(e) => handleChange(e.target.value)}

        className={compact ? "text-sm" : undefined}

      >

        {!selected ? (

          <option value="" disabled>

            Select an image model

          </option>

        ) : null}

        {krea2Available && (

          <option value={IMAGE_ENGINE_KREA2}>

            {shortCheckpointLabel(IMAGE_ENGINE_KREA2)}

          </option>

        )}

        {checkpoints.map((checkpoint) => (

          <option key={checkpoint} value={checkpoint}>

            {shortCheckpointLabel(checkpoint)}

          </option>

        ))}

      </Select>

      {!compact && (

        <p className="text-xs text-muted-foreground">

          Used for storyboard stills, character sheets, and location references.

          Krea 2 turbo uses the UNET stack (8 steps, CFG 1). Dual

          IP-Adapter shots still use SDXL when both references are present.

        </p>

      )}

      {error && (

        <p className="text-xs text-red-400" role="alert">

          {error}

        </p>

      )}

    </div>

  );

}

