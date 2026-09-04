"use client";

import { Button, Label, Select } from "@/components/ui/button";

interface SheetGenerationControlsProps {
  sampleCount: number;
  onSampleCountChange: (count: number) => void;
  generateLabel: string;
  ready: boolean;
  disabled: boolean;
  readyHint?: string | null;
  showPreview: boolean;
  onTogglePreview: () => void;
  promptPreview: string | null;
  negativePreview: string | null;
  onGenerate: () => void;
}

export function SheetGenerationControls({
  sampleCount,
  onSampleCountChange,
  generateLabel,
  ready,
  disabled,
  readyHint,
  showPreview,
  onTogglePreview,
  promptPreview,
  negativePreview,
  onGenerate,
}: SheetGenerationControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-[10rem]">
          <Label htmlFor="sample-count">Options per batch</Label>
          <Select
            id="sample-count"
            value={sampleCount}
            onChange={(e) => onSampleCountChange(Number(e.target.value))}
            disabled={disabled}
            className="mt-1.5 h-10"
          >
            <option value={2}>2 options</option>
            <option value={3}>3 options</option>
            <option value={4}>4 options</option>
          </Select>
        </div>
        <Button
          type="button"
          className="h-10 w-full sm:flex-1"
          onClick={onGenerate}
          disabled={!ready}
        >
          {generateLabel}
        </Button>
      </div>

      {!ready && readyHint ? (
        <p className="text-xs text-muted-foreground">{readyHint}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={onTogglePreview}
          className="text-sm text-primary hover:underline"
          disabled={disabled}
        >
          {showPreview ? "Hide prompt preview" : "Show prompt preview"}
        </button>
      </div>

      {showPreview && promptPreview && (
        <div className="space-y-2 rounded-lg bg-neutral-950 p-3 text-xs">
          <div>
            <p className="font-medium text-muted-foreground">Positive</p>
            <p className="mt-1 whitespace-pre-wrap">{promptPreview}</p>
          </div>
          {negativePreview && (
            <div>
              <p className="font-medium text-muted-foreground">Negative</p>
              <p className="mt-1 whitespace-pre-wrap">{negativePreview}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
