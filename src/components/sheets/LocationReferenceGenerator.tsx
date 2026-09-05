"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatShotBatchFailureMessage } from "@/components/storyboard/use-shot-placeholder-batch";
import { detectVirtualBackdropLocation } from "@/lib/location-backdrop";
import {
  LocationIpAdapterControls,
  defaultLocationIpAdapterSettings,
  locationIpAdapterSettingsToApi,
  type LocationIpAdapterSettings,
} from "@/components/sheets/LocationIpAdapterControls";
import { AssetGenerationPacksPanel } from "@/components/sheets/AssetGenerationPacksPanel";
import {
  buildOptimisticQueuedOptions,
  useSheetGenerationPacks,
} from "@/components/sheets/use-sheet-generation-packs";
import { ComfyuiGenerationStack } from "@/components/sheets/ComfyuiGenerationStack";
import { SheetGenerationControls } from "@/components/sheets/SheetGenerationControls";
import { VisualStyleBadge } from "@/components/project/VisualStylePanel";
import { AsyncRefreshOverlay } from "@/components/ui/AsyncRefreshOverlay";
import { GenerationErrorAlert } from "@/components/ui/GenerationErrorAlert";
import { Badge } from "@/components/ui/button";

interface LocationReferenceGeneratorProps {
  projectId: string;
  locationId: string;
  stateId: string;
  angleId: string;
  locationName: string;
  referenceDescription: string;
  visualStyleJson?: string | null;
  hasReference?: boolean;
  usesEstablishingAnchor?: boolean;
  anchorAngleName?: string | null;
  onReferenceSelected: () => void | Promise<void>;
}

export function LocationReferenceGenerator({
  projectId,
  locationId,
  stateId,
  angleId,
  locationName,
  referenceDescription,
  visualStyleJson,
  hasReference = false,
  usesEstablishingAnchor = false,
  anchorAngleName,
  onReferenceSelected,
}: LocationReferenceGeneratorProps) {
  const [sampleCount, setSampleCount] = useState(3);
  const [extraNegativePrompt, setExtraNegativePrompt] = useState("");
  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [negativePreview, setNegativePreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [comfyuiOk, setComfyuiOk] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [stackReady, setStackReady] = useState(false);
  const [ipAdapterAvailable, setIpAdapterAvailable] = useState<boolean | null>(
    null
  );
  const [ipAdapterSettings, setIpAdapterSettings] =
    useState<LocationIpAdapterSettings>(() =>
      defaultLocationIpAdapterSettings(referenceDescription, locationName)
    );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!hasReference);

  const apiBase = useMemo(
    () =>
      `/api/projects/${projectId}/locations/${locationId}/states/${stateId}/angles/${angleId}`,
    [projectId, locationId, stateId, angleId]
  );

  const {
    batch,
    options,
    packs,
    activeBatchId,
    viewingBatchId,
    viewingBatchIdRef,
    applyBatchView,
    loadBatch,
    selectPack,
    handleStreamMessage,
    dismissPack,
    setViewingBatchId,
    setBatch,
    setOptions,
  } = useSheetGenerationPacks(apiBase);

  const loadBatchSafe = useCallback(async () => {
    try {
      await loadBatch();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batch");
    }
  }, [loadBatch]);

  const loadPromptPreview = useCallback(async () => {
    if (!locationName.trim() || !referenceDescription.trim()) {
      setPreviewError(
        "Add a location description, state look, or angle view before previewing."
      );
      setPromptPreview(null);
      setNegativePreview(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const params = new URLSearchParams({
        name: locationName,
        description: referenceDescription,
        projectId,
      });
      if (usesEstablishingAnchor) {
        params.set("anchorMode", "true");
      }
      if (extraNegativePrompt.trim()) {
        params.set("extraNegativePrompt", extraNegativePrompt.trim());
      }
      const res = await fetch(
        `/api/prompt-preview/location-reference?${params.toString()}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load prompt preview");
      }
      setPromptPreview(data.processedPrompt ?? null);
      setNegativePreview(data.negativePrompt ?? null);
    } catch (err) {
      setPromptPreview(null);
      setNegativePreview(null);
      setPreviewError(
        err instanceof Error ? err.message : "Failed to load prompt preview"
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [
    locationName,
    referenceDescription,
    projectId,
    usesEstablishingAnchor,
    extraNegativePrompt,
  ]);

  const togglePromptPreview = useCallback(() => {
    setShowPreview((open) => {
      const next = !open;
      if (next) void loadPromptPreview();
      return next;
    });
  }, [loadPromptPreview]);

  useEffect(() => {
    setIpAdapterSettings(
      defaultLocationIpAdapterSettings(referenceDescription, locationName)
    );
  }, [angleId, referenceDescription, locationName]);

  useEffect(() => {
    if (!expanded) return;
    void loadBatchSafe();
  }, [loadBatchSafe, angleId, expanded]);

  useEffect(() => {
    if (showPreview) void loadPromptPreview();
  }, [showPreview, loadPromptPreview]);

  useEffect(() => {
    if (!expanded) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`${apiBase}/sheet-batch/stream`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleStreamMessage(data, submittingRef.current);
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
  }, [apiBase, handleStreamMessage, expanded]);

  async function handleGenerate(replace = false) {
    if (replace) {
      const message =
        "Start a new generation pack? Previous packs stay saved so you can compare and pick from any of them.";
      if (!confirm(message)) return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    setError(null);
    setExpanded(true);
    viewingBatchIdRef.current = null;
    setViewingBatchId(null);
    setOptions(
      buildOptimisticQueuedOptions(sampleCount, replace ? options : [], batch?.id ?? null)
    );
    if (batch) {
      setBatch({ ...batch, status: "queued", errorMessage: null });
    }
    try {
      const res = await fetch(`${apiBase}/generate-sheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: sampleCount,
          replace,
          generationOptions: usesEstablishingAnchor
            ? locationIpAdapterSettingsToApi(ipAdapterSettings)
            : undefined,
          extraNegativePrompt: extraNegativePrompt.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      const nextBatchId = data.activeBatchId ?? data.batch?.id ?? null;
      applyBatchView(data, nextBatchId);
      await loadBatch(nextBatchId);
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
        "Use this image as the reference for this angle? The pack stays saved so you can compare or pick a different option later."
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
      applyBatchView(data, viewingBatchIdRef.current ?? data.activeBatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed");
    } finally {
      setSelectingId(null);
    }
  }

  async function dismissError() {
    setError(null);
    if (batchFailed && viewingBatchId === activeBatchId) {
      try {
        await dismissPack();
      } catch {
        /* keep visible batch if dismiss fails */
      }
    }
  }

  const activePack =
    packs.find((pack) => pack.batch.id === activeBatchId) ?? null;
  const activeBatch = activePack?.batch ?? null;
  const descriptionEmpty = !referenceDescription.trim();
  const backdropMode = detectVirtualBackdropLocation(
    locationName,
    referenceDescription
  );
  const isGenerating =
    submitting ||
    activeBatch?.status === "queued" ||
    activeBatch?.status === "running";
  const batchFailed = batch?.status === "failed";
  const canSelectFromPack =
    batch?.status === "awaiting_selection" || batch?.status === "archived";
  const awaitingSelection = canSelectFromPack;
  const batchBusy =
    batch?.status === "queued" || batch?.status === "running";
  const canRegenerate =
    activeBatch?.status === "awaiting_selection" && !isGenerating;
  const canReplaceBatch = canRegenerate || batchFailed;
  const generateLabel =
    canRegenerate && !isGenerating
      ? batchFailed && viewingBatchId === activeBatchId
        ? "Try again"
        : "Regenerate reference options"
      : "Generate reference options";
  const ready =
    !descriptionEmpty &&
    comfyuiOk === true &&
    stackReady &&
    !isGenerating;
  const readyHint = descriptionEmpty
    ? null
    : isGenerating
      ? null
      : comfyuiOk === false
        ? "ComfyUI is not reachable. Check Settings or System Status."
        : !stackReady
          ? "The image model below is not saved for this project yet. Pick one, then Generate will unlock."
          : batchBusy && !canReplaceBatch
            ? "Wait for the current batch to finish."
            : null;
  const displayError =
    error ??
    (batchFailed && viewingBatchId === activeBatchId && batch
      ? formatShotBatchFailureMessage(batch, options)
      : null);
  const showOptions =
    packs.length > 0 || Boolean(batch && (isGenerating || submitting));

  useEffect(() => {
    if (displayError || isGenerating || awaitingSelection || submitting) {
      setExpanded(true);
      return;
    }
    if (packs.length > 0) {
      return;
    }
    setExpanded(!hasReference);
  }, [
    angleId,
    hasReference,
    displayError,
    isGenerating,
    awaitingSelection,
    submitting,
    packs.length,
  ]);

  return (
    <div className="relative mt-8 space-y-4 border-t border-neutral-800 pt-8">
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
            Location Reference Generator
          </h3>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <VisualStyleBadge styleJson={visualStyleJson} />
          {batch && (
            <Badge
              variant={
                batch.status === "awaiting_selection" ||
                batch.status === "archived"
                  ? "success"
                  : batch.status === "failed"
                    ? "error"
                    : "warning"
              }
            >
              {batch.status === "archived"
                ? "saved"
                : batch.status.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </div>

      {displayError && (
        <GenerationErrorAlert
          message={displayError}
          onDismiss={() => void dismissError()}
        />
      )}

      {expanded && (
        <>
          <p className="text-sm text-muted-foreground">
            Generate environment reference options for this camera angle via
            ComfyUI. Pick one image to save as the reference for this angle.{" "}
            <Link
              href={`/projects/${projectId}`}
              className="text-primary hover:underline"
            >
              Change project look
            </Link>
            .
          </p>

          {backdropMode && (
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-100/90">
              Seamless backdrop detected. Describe the surface color and tone
              the camera sees, not studio lights or equipment. Example angle
              view: &quot;Medium shot, neutral gray seamless fills the entire
              frame edge to edge, soft even light, no floor visible, no
              equipment.&quot;
            </div>
          )}

          {usesEstablishingAnchor && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-muted-foreground">
              {ipAdapterAvailable ? (
                backdropMode ? (
                  <>
                    This angle uses IP-Adapter with your saved{" "}
                    {anchorAngleName ? `"${anchorAngleName}"` : "anchor"}{" "}
                    reference to match gray tone and softness only. Your angle
                    description sets crop and framing. Tighter angles use a
                    lighter anchor so they stay in-camera plates, not studio
                    setup shots.
                  </>
                ) : (
                  <>
                    This angle uses IP-Adapter with your saved{" "}
                    {anchorAngleName ? `"${anchorAngleName}"` : "establishing"}{" "}
                    reference to match materials, weather, and scale. Your angle
                    description sets the camera and framing. Close-ups use a
                    lighter anchor so they are not copies of the wide master.
                  </>
                )
              ) : (
                <>
                  Without IP-Adapter, this angle generates from your description
                  only (txt2img). It can produce a new camera angle, but it will
                  not visually lock to your saved{" "}
                  {anchorAngleName ? `"${anchorAngleName}"` : "establishing"}{" "}
                  reference. Install ComfyUI_IPAdapter_plus on your ComfyUI
                  server for set-matched reframes from the establishing shot.
                </>
              )}
            </div>
          )}

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
              Add a location description, state look, or angle view first.
            </p>
          )}

          {!descriptionEmpty && (
            <ComfyuiGenerationStack
              projectId={projectId}
              workflowNameOverride={
                usesEstablishingAnchor
                  ? ipAdapterAvailable
                    ? "Location reference from anchor (IP-Adapter)"
                    : "Location reference (prompt driven, no IP-Adapter)"
                  : undefined
              }
              batchActive={isGenerating || awaitingSelection}
              onReadyChange={setStackReady}
              onStackChange={(stack) => {
                setComfyuiOk(stack?.comfyuiReachable ?? false);
                setIpAdapterAvailable(stack?.ipAdapterAvailable ?? null);
              }}
            >
              {({ checkpointGate, settingsSummary }) => (
                <div className="space-y-4">
                  {checkpointGate}
                  {usesEstablishingAnchor && ipAdapterAvailable && (
                    <LocationIpAdapterControls
                      referenceDescription={referenceDescription}
                      locationName={locationName}
                      settings={ipAdapterSettings}
                      onChange={setIpAdapterSettings}
                      disabled={isGenerating}
                    />
                  )}
                  <SheetGenerationControls
                    sampleCount={sampleCount}
                    onSampleCountChange={setSampleCount}
                    generateLabel={generateLabel}
                    ready={ready}
                    readyHint={readyHint}
                    disabled={descriptionEmpty || isGenerating}
                    showPreview={showPreview}
                    onTogglePreview={togglePromptPreview}
                    promptPreview={promptPreview}
                    negativePreview={negativePreview}
                    previewLoading={previewLoading}
                    previewError={previewError}
                    stillNegativePrompt={extraNegativePrompt}
                    onStillNegativePromptChange={setExtraNegativePrompt}
                    extraNegativeLabel="Extra negative prompt (this location reference)"
                    extraNegativePlaceholder="Optional. Appended to this location reference's negatives only."
                    previewEmptyHint="No preview text returned. Check the description and try again."
                    onGenerate={() => void handleGenerate(canReplaceBatch)}
                    previewDisabled={descriptionEmpty}
                  />
                  {settingsSummary}
                </div>
              )}
            </ComfyuiGenerationStack>
          )}
        </>
      )}

      {showOptions && batch && (
        <AssetGenerationPacksPanel
          projectId={projectId}
          packs={packs}
          batch={batch}
          options={options}
          viewingBatchId={viewingBatchId}
          activeBatchId={activeBatchId}
          onSelectPack={selectPack}
          canSelectFromPack={canSelectFromPack}
          selectingId={selectingId}
          onSelectOption={(optionId) => void handleSelect(optionId)}
          onDismissPack={() => void dismissPack().catch(() => undefined)}
          selectLabel="Select this image"
          optionAltPrefix="Location reference option"
        />
      )}
    </div>
  );
}
