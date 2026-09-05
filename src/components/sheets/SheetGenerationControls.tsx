"use client";

import { Button, Label, Select, Textarea } from "@/components/ui/button";

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
  previewLoading?: boolean;
  previewError?: string | null;
  stillNegativePrompt?: string;
  onStillNegativePromptChange?: (value: string) => void;
  extraNegativeLabel?: string;
  extraNegativePlaceholder?: string;
  onGenerate: () => void;
  previewDisabled?: boolean;
  previewEmptyHint?: string;
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
  previewLoading = false,
  previewError = null,
  stillNegativePrompt,
  onStillNegativePromptChange,
  extraNegativeLabel = "Extra negative prompt (this generation)",
  extraNegativePlaceholder = "Optional. Appended to this generation's negatives only.",
  onGenerate,
  previewDisabled = false,
  previewEmptyHint = "No preview text returned. Check the description and try again.",
}: SheetGenerationControlsProps) {
  return (
    <div className="space-y-3">
      {!ready && readyHint ? (
        <p className="text-sm text-amber-200/90" role="status">
          {readyHint}
        </p>
      ) : null}
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
          disabled={!ready || disabled}
          title={!ready && readyHint ? readyHint : undefined}
        >
          {generateLabel}
        </Button>
      </div>

      {onStillNegativePromptChange ? (
        <div className="space-y-1.5">
          <Label htmlFor="extra-negative-prompt">{extraNegativeLabel}</Label>
          <Textarea
            id="extra-negative-prompt"
            value={stillNegativePrompt ?? ""}
            onChange={(e) => onStillNegativePromptChange(e.target.value)}
            placeholder={extraNegativePlaceholder}
            rows={2}
            className="text-sm"
            disabled={disabled}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={onTogglePreview}
          className="text-sm text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          disabled={previewDisabled}
        >
          {showPreview ? "Hide prompt preview" : "Show prompt preview"}
        </button>
      </div>

      {showPreview ? (
        <div className="space-y-2 rounded-lg bg-neutral-950 p-3 text-xs">
          {previewLoading ? (
            <p className="text-muted-foreground">Loading prompt preview…</p>
          ) : previewError ? (
            <p className="text-red-400" role="alert">
              {previewError}
            </p>
          ) : promptPreview ? (
            <>
              <div>
                <p className="font-medium text-muted-foreground">Positive</p>
                <p className="mt-1 whitespace-pre-wrap">{promptPreview}</p>
              </div>
              {negativePreview ? (
                <div>
                  <p className="font-medium text-muted-foreground">Negative</p>
                  <p className="mt-1 whitespace-pre-wrap">{negativePreview}</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">{previewEmptyHint}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
