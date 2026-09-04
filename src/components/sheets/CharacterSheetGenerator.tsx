"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  AssetGenerationBatch,
  AssetGenerationOption,
} from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { formatComfyuiError } from "@/lib/services/comfyui-errors";
import { GenerationErrorAlert } from "@/components/ui/GenerationErrorAlert";
import { ComfyuiGenerationStack } from "@/components/sheets/ComfyuiGenerationStack";
import { SheetGenerationControls } from "@/components/sheets/SheetGenerationControls";
import { VisualStyleBadge } from "@/components/project/VisualStylePanel";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { AsyncRefreshOverlay } from "@/components/ui/AsyncRefreshOverlay";
import { Button, Badge } from "@/components/ui/button";

interface CharacterSheetGeneratorProps {
  projectId: string;
  characterId: string;
  stateId: string;
  characterName: string;
  sheetDescription: string;
  visualStyleJson?: string | null;
  hasReference?: boolean;
  onReferenceSelected: () => void | Promise<void>;
}

function statusVariant(
  status: AssetGenerationOption["status"]
): "default" | "success" | "warning" | "error" {
  if (status === "completed") return "success";
  if (status === "running") return "warning";
  if (status === "failed" || status === "cancelled") return "error";
  return "default";
}

export function CharacterSheetGenerator({
  projectId,
  characterId,
  stateId,
  characterName,
  sheetDescription,
  visualStyleJson,
  hasReference = false,
  onReferenceSelected,
}: CharacterSheetGeneratorProps) {
  const [batch, setBatch] = useState<AssetGenerationBatch | null>(null);
  const [options, setOptions] = useState<AssetGenerationOption[]>([]);
  const [sampleCount, setSampleCount] = useState(3);
  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [negativePreview, setNegativePreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [comfyuiOk, setComfyuiOk] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [stackReady, setStackReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!hasReference);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );

  const apiBase = useMemo(
    () =>
      `/api/projects/${projectId}/characters/${characterId}/states/${stateId}`,
    [projectId, characterId, stateId]
  );

  const loadBatch = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/sheet-batch`);
      if (res.status === 404) {
        setBatch(null);
        setOptions([]);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load batch");
      setBatch(data.batch);
      setOptions(data.options ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batch");
    }
  }, [apiBase]);

  const loadPromptPreview = useCallback(async () => {
    if (!characterName.trim() || !sheetDescription.trim()) return;
    try {
      const params = new URLSearchParams({
        name: characterName,
        description: sheetDescription,
        projectId,
      });
      const res = await fetch(
        `/api/prompt-preview/character-sheet?${params.toString()}`
      );
      const data = await res.json();
      if (res.ok) {
        setPromptPreview(data.processedPrompt);
        setNegativePreview(data.negativePrompt);
      }
    } catch {
      /* ignore preview errors */
    }
  }, [characterName, sheetDescription, projectId]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch, stateId]);

  useEffect(() => {
    if (showPreview) void loadPromptPreview();
  }, [showPreview, loadPromptPreview]);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`${apiBase}/sheet-batch/stream`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            batch?: AssetGenerationBatch | null;
            options?: AssetGenerationOption[];
          };
          if (data.batch) {
            setBatch(data.batch);
            setOptions(data.options ?? []);
          } else if (!submittingRef.current) {
            setBatch(null);
            setOptions([]);
          }
        } catch {
          /* ignore */
        }
      };

      es.onerror = () => {
        es?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [apiBase]);

  async function handleGenerate(replace = false) {
    if (replace) {
      const message = promptDrifted
        ? "Discard the current options and generate with your updated description?"
        : hasReference
          ? "Discard the current options and generate a new batch? Your saved reference stays until you pick a new design."
          : "Discard the current options and generate a new batch using the project's current visual look?";
      if (!confirm(message)) return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    setError(null);
    try {
      const res = await fetch(`${apiBase}/generate-sheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: sampleCount,
          replace,
          description: sheetDescription.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setBatch(data.batch ?? null);
      setOptions(data.options ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleSelect(optionId: string) {
    if (
      !confirm(
        "Use this design as the character reference? Other options will be deleted."
      )
    ) {
      return;
    }
    setSelectingId(optionId);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/select-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Selection failed");
      await Promise.resolve(onReferenceSelected());
      setBatch(null);
      setOptions([]);
      setExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed");
    } finally {
      setSelectingId(null);
    }
  }

  const descriptionEmpty = !sheetDescription.trim();
  const batchFailed = batch?.status === "failed";
  const awaitingSelection = batch?.status === "awaiting_selection";
  const batchBusy =
    batch?.status === "queued" || batch?.status === "running";
  const promptDrifted = Boolean(
    batch &&
      sheetDescription.trim() &&
      sheetDescription.trim() !== batch.rawPrompt.trim()
  );
  const canReplaceBatch =
    awaitingSelection || batchFailed || promptDrifted;
  const isGenerating = submitting || (batchBusy && !canReplaceBatch);
  const generateLabel = promptDrifted
    ? "Regenerate with updated description"
    : canReplaceBatch && !submitting
      ? batchFailed
        ? "Try again"
        : "Regenerate character sheet options"
      : "Generate character sheet options";
  const ready =
    !descriptionEmpty &&
    comfyuiOk === true &&
    stackReady &&
    !isGenerating;
  const readyHint = descriptionEmpty
    ? null
    : comfyuiOk === false
      ? "ComfyUI must be reachable before generating."
      : !stackReady
        ? "Loading generation settings…"
        : batchBusy && !canReplaceBatch
          ? "Wait for the current batch to finish."
          : null;

  useEffect(() => {
    setExpanded(!hasReference);
  }, [stateId, hasReference]);

  useEffect(() => {
    if (batchBusy || awaitingSelection || submitting) {
      setExpanded(true);
    }
  }, [batchBusy, awaitingSelection, submitting]);

  return (
    <div className="relative mt-8 space-y-4">
      <AsyncRefreshOverlay
        active={selectingId !== null}
        message="Saving reference…"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <h3 className="text-base font-semibold text-muted-foreground">
            Character Sheet Generator
          </h3>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <VisualStyleBadge styleJson={visualStyleJson} />
          {batch && (
          <Badge
            variant={
              batch.status === "awaiting_selection"
                ? "success"
                : batch.status === "failed"
                  ? "error"
                  : "warning"
            }
          >
            {batch.status.replace(/_/g, " ")}
          </Badge>
        )}
        </div>
      </div>

      {expanded && (
        <>
      <p className="text-sm text-muted-foreground">
        Generate casting-style reference options via ComfyUI. Photo-real projects
        use a single full-body portrait per option, not a multi-view turnaround.
        Pick one design to set as the canonical reference.{" "}
        <Link
          href={`/projects/${projectId}`}
          className="text-primary hover:underline"
        >
          Change project look
        </Link>
        .
      </p>

      {comfyuiOk === false && (
        <div className="rounded-lg bg-black p-3 text-sm text-amber-200/90">
          ComfyUI is not reachable. Configure endpoints in{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>{" "}
          or check{" "}
          <Link href="/setup" className="text-primary hover:underline">
            System Status
          </Link>
          .
        </div>
      )}

      {descriptionEmpty && (
        <p className="text-sm text-muted-foreground">
          Add a description first to generate character sheets.
        </p>
      )}

      {promptDrifted && !descriptionEmpty && (
        <p className="text-sm text-amber-400">
          Description changed since this batch was generated. Regenerate to use
          the new prompt.
        </p>
      )}

      {!descriptionEmpty && (
        <ComfyuiGenerationStack
          projectId={projectId}
          batchActive={batchBusy || awaitingSelection}
          onReadyChange={setStackReady}
          onStackChange={(stack) => setComfyuiOk(stack?.comfyuiReachable ?? false)}
        >
          {({ checkpointGate, settingsSummary }) => (
            <div className="space-y-4">
              {checkpointGate}
              <SheetGenerationControls
                sampleCount={sampleCount}
                onSampleCountChange={setSampleCount}
                generateLabel={generateLabel}
                ready={ready}
                disabled={descriptionEmpty || (batchBusy && !canReplaceBatch)}
                readyHint={readyHint}
                showPreview={showPreview}
                onTogglePreview={() => setShowPreview((value) => !value)}
                promptPreview={promptPreview}
                negativePreview={negativePreview}
                onGenerate={() => void handleGenerate(canReplaceBatch)}
              />
              {settingsSummary}
            </div>
          )}
        </ComfyuiGenerationStack>
      )}

      {batch && (batchBusy || awaitingSelection) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const previewSrc = option.outputPath
              ? mediaUrl(projectId, option.outputPath)
              : null;
            const progressPct = Math.round(option.progress * 100);

            return (
              <div key={option.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Option {option.variantIndex + 1}
                  </span>
                  <Badge variant={statusVariant(option.status)}>
                    {option.status}
                  </Badge>
                </div>

                {previewSrc ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox({
                        src: previewSrc,
                        alt: `Character sheet option ${option.variantIndex + 1}`,
                      })
                    }
                    className="block w-full cursor-zoom-in overflow-hidden rounded-lg bg-black transition hover:opacity-90"
                  >
                    <div className="aspect-video w-full bg-black/40">
                      <img
                        src={previewSrc}
                        alt={`Character sheet option ${option.variantIndex + 1}`}
                        className="ui-image-enter h-full w-full object-contain"
                      />
                    </div>
                  </button>
                ) : (
                  <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {option.statusMessage ?? `${progressPct}%`}
                    </p>
                  </div>
                )}

                {option.errorMessage && (
                  <p className="text-xs text-red-400">
                    {formatComfyuiError(option.errorMessage)}
                  </p>
                )}

                {awaitingSelection && option.status === "completed" && (
                  <Button
                    size="sm"
                    onClick={() => void handleSelect(option.id)}
                    disabled={selectingId === option.id}
                  >
                    {selectingId === option.id
                      ? "Selecting…"
                      : "Select this design"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {batch?.errorMessage && (
        <p className="text-sm text-red-400">
          {formatComfyuiError(batch.errorMessage)}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
        </>
      )}
    </div>
  );
}
