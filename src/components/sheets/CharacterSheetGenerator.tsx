"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatShotBatchFailureMessage } from "@/components/storyboard/use-shot-placeholder-batch";
import {
  LocationIpAdapterControls,
  defaultCharacterIpAdapterSettings,
  locationIpAdapterSettingsToApi,
  type LocationIpAdapterSettings,
} from "@/components/sheets/LocationIpAdapterControls";
import { detectCharacterRearView } from "@/lib/anchor-reframe";
import { GenerationErrorAlert } from "@/components/ui/GenerationErrorAlert";
import { AssetGenerationPacksPanel } from "@/components/sheets/AssetGenerationPacksPanel";
import {
  buildOptimisticQueuedOptions,
  useSheetGenerationPacks,
} from "@/components/sheets/use-sheet-generation-packs";
import { ComfyuiGenerationStack } from "@/components/sheets/ComfyuiGenerationStack";
import { SheetGenerationControls } from "@/components/sheets/SheetGenerationControls";
import { VisualStyleBadge } from "@/components/project/VisualStylePanel";
import { AsyncRefreshOverlay } from "@/components/ui/AsyncRefreshOverlay";
import { Badge } from "@/components/ui/button";

const CHARACTER_SHEET_GENERATOR_EXPANDED_PREFIX =
  "diffusecut:character-sheet-generator-expanded";

function characterSheetGeneratorExpandedKey(
  projectId: string,
  characterId: string,
  stateId: string,
  angleId?: string
): string {
  const base = `${CHARACTER_SHEET_GENERATOR_EXPANDED_PREFIX}:${projectId}:${characterId}:${stateId}`;
  return angleId ? `${base}:${angleId}` : base;
}

function readStoredCharacterSheetGeneratorExpanded(
  storageKey: string
): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredCharacterSheetGeneratorExpanded(
  storageKey: string,
  expanded: boolean
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, expanded ? "true" : "false");
  } catch {
    /* ignore quota / private mode */
  }
}

function isPlaceholderAngleViewDescription(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    !trimmed ||
    trimmed === "describe the pose, framing, and camera angle" ||
    trimmed === "describe the pose, framing, and camera angle."
  );
}

interface CharacterSheetGeneratorProps {
  projectId: string;
  characterId: string;
  stateId: string;
  angleId?: string;
  characterName: string;
  sheetDescription: string;
  batchReferenceDescription?: string;
  angleViewDescription?: string;
  onBeforeGenerate?: () => Promise<void>;
  visualStyleJson?: string | null;
  hasReference?: boolean;
  usesFrontAnchor?: boolean;
  anchorAngleName?: string | null;
  splitPairAngles?: { frontAngleId: string; backAngleId: string } | null;
  onReferenceSelected: () => void | Promise<void>;
}

export function CharacterSheetGenerator({
  projectId,
  characterId,
  stateId,
  angleId,
  characterName,
  sheetDescription,
  batchReferenceDescription,
  angleViewDescription = "",
  onBeforeGenerate,
  visualStyleJson,
  hasReference = false,
  usesFrontAnchor = false,
  anchorAngleName,
  splitPairAngles = null,
  onReferenceSelected,
}: CharacterSheetGeneratorProps) {
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
      defaultCharacterIpAdapterSettings(sheetDescription, angleViewDescription)
    );
  const [error, setError] = useState<string | null>(null);
  const expandedStorageKey = useMemo(
    () =>
      characterSheetGeneratorExpandedKey(
        projectId,
        characterId,
        stateId,
        angleId
      ),
    [projectId, characterId, stateId, angleId]
  );
  const hydratedExpandedKeyRef = useRef<string | null>(null);
  const [expanded, setExpanded] = useState(() => {
    const stored = readStoredCharacterSheetGeneratorExpanded(
      characterSheetGeneratorExpandedKey(
        projectId,
        characterId,
        stateId,
        angleId
      )
    );
    return stored ?? !hasReference;
  });

  const setExpandedPersisted = useCallback(
    (next: boolean | ((open: boolean) => boolean)) => {
      setExpanded((open) => {
        const value = typeof next === "function" ? next(open) : next;
        writeStoredCharacterSheetGeneratorExpanded(expandedStorageKey, value);
        return value;
      });
    },
    [expandedStorageKey]
  );

  const apiBase = useMemo(
    () =>
      angleId
        ? `/api/projects/${projectId}/characters/${characterId}/states/${stateId}/angles/${angleId}`
        : `/api/projects/${projectId}/characters/${characterId}/states/${stateId}`,
    [projectId, characterId, stateId, angleId]
  );

  const {
    batch,
    options,
    packs,
    activeBatchId,
    viewingBatchId,
    viewingBatchIdRef,
    setViewingBatchId,
    applyBatchView,
    loadBatch,
    selectPack,
    handleStreamMessage,
    dismissPack,
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
    if (!characterName.trim() || !sheetDescription.trim()) {
      setPreviewError("Add a character description before previewing.");
      setPromptPreview(null);
      setNegativePreview(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const params = new URLSearchParams({
        name: characterName,
        description: sheetDescription,
        projectId,
      });
      if (extraNegativePrompt.trim()) {
        params.set("extraNegativePrompt", extraNegativePrompt.trim());
      }
      if (angleId && usesFrontAnchor) {
        params.set("anchorMode", "true");
        if (angleViewDescription.trim()) {
          params.set("viewDescription", angleViewDescription.trim());
        }
      }
      const res = await fetch(
        `/api/prompt-preview/character-sheet?${params.toString()}`
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
  }, [characterName, sheetDescription, projectId, extraNegativePrompt, angleId, usesFrontAnchor, angleViewDescription]);

  useEffect(() => {
    setIpAdapterSettings(
      defaultCharacterIpAdapterSettings(sheetDescription, angleViewDescription)
    );
  }, [angleId, sheetDescription, angleViewDescription]);

  const togglePromptPreview = useCallback(() => {
    setShowPreview((open) => {
      const next = !open;
      if (next) void loadPromptPreview();
      return next;
    });
  }, [loadPromptPreview]);

  useEffect(() => {
    if (!expanded) return;
    void loadBatchSafe();
  }, [loadBatchSafe, stateId, angleId, expanded]);

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
      const message = promptDrifted
        ? "Start a new generation pack with your updated description? Previous packs stay saved."
        : "Start a new generation pack? Previous packs stay saved so you can compare and pick from any of them.";
      if (!confirm(message)) return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    setError(null);
    setExpandedPersisted(true);
    viewingBatchIdRef.current = null;
    setViewingBatchId(null);
    setOptions(
      buildOptimisticQueuedOptions(sampleCount, replace ? options : [], batch?.id ?? null)
    );
    if (batch) {
      setBatch({ ...batch, status: "queued", errorMessage: null });
    }
    try {
      if (onBeforeGenerate) {
        await onBeforeGenerate();
      }
      const res = await fetch(`${apiBase}/generate-sheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: sampleCount,
          replace,
          ...(angleId
            ? {
                generationOptions: usesFrontAnchor
                  ? locationIpAdapterSettingsToApi(ipAdapterSettings)
                  : undefined,
              }
            : { description: sheetDescription.trim() }),
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

  async function postSelect(
    optionId: string,
    body: {
      panel?: "full" | "left" | "right";
      splitPair?: { frontAngleId: string; backAngleId: string };
    }
  ) {
    setSelectingId(optionId);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/select-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Selection failed");
      await Promise.resolve(onReferenceSelected());
      applyBatchView(data, viewingBatchIdRef.current ?? data.activeBatchId);
      setExpandedPersisted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed");
    } finally {
      setSelectingId(null);
    }
  }

  async function handleSelect(optionId: string) {
    if (
      !confirm(
        "Use this design as the character reference? The pack stays saved so you can compare or pick a different option later."
      )
    ) {
      return;
    }
    await postSelect(optionId, { panel: "full" });
  }

  async function handleSelectPanel(
    optionId: string,
    panel: "full" | "left" | "right"
  ) {
    const message =
      panel === "full"
        ? "Use this design as the character reference? The pack stays saved so you can compare or pick a different option later."
        : panel === "left"
          ? "Use the left panel as this angle's reference? Works best on front/back diptych images."
          : "Use the right panel as this angle's reference? Works best on front/back diptych images.";
    if (!confirm(message)) return;
    await postSelect(optionId, { panel });
  }

  async function handleSplitPair(optionId: string) {
    if (!splitPairAngles) return;
    if (
      !confirm(
        "Use this design for both angles? The left panel saves to the front angle and the right panel saves to the back angle. Each panel is padded to your project reference ratio (for example 16:9)."
      )
    ) {
      return;
    }
    await postSelect(optionId, { splitPair: splitPairAngles });
  }

  async function dismissError() {
    setError(null);
    if (batchFailed && viewingBatchId === activeBatchId) {
      try {
        await dismissPack();
      } catch {
        /* keep visible pack if dismiss fails */
      }
    }
  }

  const activePack =
    packs.find((pack) => pack.batch.id === activeBatchId) ?? null;
  const activeBatch = activePack?.batch ?? null;
  const isRearViewAngle = useMemo(
    () => detectCharacterRearView(angleViewDescription || sheetDescription),
    [angleViewDescription, sheetDescription]
  );

  const descriptionEmpty = !sheetDescription.trim();
  const angleViewEmpty = Boolean(
    angleId && isPlaceholderAngleViewDescription(angleViewDescription)
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
  const effectiveBatchReference =
    batchReferenceDescription?.trim() || sheetDescription.trim();
  const promptDrifted = Boolean(
    batch &&
      effectiveBatchReference &&
      effectiveBatchReference !== batch.rawPrompt.trim()
  );
  const canRegenerate =
    activeBatch?.status === "awaiting_selection" && !isGenerating;
  const canReplaceBatch = canRegenerate || batchFailed || promptDrifted;
  const generateLabel = promptDrifted
    ? "Regenerate with updated description"
    : canRegenerate && !isGenerating
      ? batchFailed && viewingBatchId === activeBatchId
        ? "Try again"
        : "Regenerate character sheet options"
      : "Generate character sheet options";
  const ready =
    !descriptionEmpty &&
    !angleViewEmpty &&
    comfyuiOk === true &&
    stackReady &&
    !isGenerating;
  const readyHint = descriptionEmpty
    ? null
    : angleViewEmpty
      ? "Add a view description for this angle before generating."
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
    if (hydratedExpandedKeyRef.current === expandedStorageKey) return;
    hydratedExpandedKeyRef.current = expandedStorageKey;
    const stored = readStoredCharacterSheetGeneratorExpanded(expandedStorageKey);
    setExpanded(stored ?? !hasReference);
  }, [expandedStorageKey, hasReference]);

  const skipAutoExpandOnMountRef = useRef(true);
  useEffect(() => {
    if (skipAutoExpandOnMountRef.current) {
      skipAutoExpandOnMountRef.current = false;
      return;
    }
    // Only expand for in-flight generation, not because saved packs exist on load.
    if (submitting || isGenerating) {
      setExpandedPersisted(true);
    }
  }, [submitting, isGenerating, setExpandedPersisted]);

  return (
    <div className="relative mt-8 space-y-4 border-t border-neutral-800 pt-8">
      <AsyncRefreshOverlay
        active={selectingId !== null}
        message="Saving reference…"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpandedPersisted((open) => !open)}
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
          {(batch || submitting) && (
            <Badge
              variant={
                submitting ||
                batch?.status === "queued" ||
                batch?.status === "running"
                  ? "warning"
                  : batch?.status === "awaiting_selection" ||
                      batch?.status === "archived"
                    ? "success"
                    : batch?.status === "failed"
                      ? "error"
                      : "warning"
              }
            >
              {submitting && (!batch || batch.status === "queued")
                ? "starting"
                : batch?.status === "archived"
                  ? "saved"
                  : (batch?.status ?? "starting").replace(/_/g, " ")}
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
            Generate casting-style reference options via ComfyUI. Photo-real
            projects use a single full-body 16:9 portrait per option, not a
            multi-view turnaround. Pick one design to set as the canonical
            reference.{" "}
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

          {angleId && usesFrontAnchor && !descriptionEmpty && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-muted-foreground">
              {ipAdapterAvailable ? (
                <>
                  This angle uses IP-Adapter with your saved{" "}
                  {anchorAngleName ? `"${anchorAngleName}"` : "front"}{" "}
                  reference to match face, costume, and body type. Your angle
                  description sets pose and framing. Tighter angles use a
                  lighter anchor so they are not copies of the front master.
                  {isRearViewAngle ? (
                    <>
                      {" "}
                      Back angles use Prompt only by default. IP-Adapter with a
                      front reference causes front-facing double portraits. After
                      you get a good back shot, select it to save as this
                      angle&apos;s reference.
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  Without IP-Adapter, this angle generates from your description
                  only (txt2img). It can produce a new pose, but it will not
                  visually lock to your saved{" "}
                  {anchorAngleName ? `"${anchorAngleName}"` : "front"}{" "}
                  reference. Install ComfyUI_IPAdapter_plus on your ComfyUI
                  server for identity-matched reframes from the front shot.
                </>
              )}
            </div>
          )}

          {splitPairAngles && angleId === splitPairAngles.frontAngleId && (
            <p className="text-sm text-neutral-400">
              This state has front and back angles. Generating here creates a
              front+back double portrait. Pick a result with &quot;Use this design
              (front + back)&quot; to assign both panels at once.
            </p>
          )}

          {promptDrifted && !descriptionEmpty && (
            <p className="text-sm text-amber-400">
              Description changed since this pack was generated. Regenerate to
              use the new prompt.
            </p>
          )}

          {!descriptionEmpty && (
            <ComfyuiGenerationStack
              projectId={projectId}
              workflowNameOverride={
                angleId && usesFrontAnchor
                  ? ipAdapterAvailable
                    ? "Character reference from anchor (IP-Adapter)"
                    : "Character reference (prompt driven, no IP-Adapter)"
                  : undefined
              }
              batchActive={batchBusy || awaitingSelection}
              onReadyChange={setStackReady}
              onStackChange={(stack) => {
                setComfyuiOk(stack?.comfyuiReachable ?? false);
                setIpAdapterAvailable(stack?.ipAdapterAvailable ?? null);
              }}
            >
              {({ checkpointGate, settingsSummary }) => (
                <div className="space-y-4">
                  {checkpointGate}
                  {angleId && usesFrontAnchor && ipAdapterAvailable && (
                    <LocationIpAdapterControls
                      referenceDescription={sheetDescription}
                      locationName={characterName}
                      viewDescription={angleViewDescription}
                      entityKind="character"
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
                    disabled={descriptionEmpty || isGenerating}
                    readyHint={readyHint}
                    showPreview={showPreview}
                    onTogglePreview={togglePromptPreview}
                    promptPreview={promptPreview}
                    negativePreview={negativePreview}
                    previewLoading={previewLoading}
                    previewError={previewError}
                    stillNegativePrompt={extraNegativePrompt}
                    onStillNegativePromptChange={setExtraNegativePrompt}
                    extraNegativeLabel="Extra negative prompt (this character sheet)"
                    extraNegativePlaceholder="Optional. Appended to this character sheet's negatives only."
                    previewEmptyHint="No preview text returned. Check the description and try again."
                    onGenerate={() => void handleGenerate(canReplaceBatch)}
                    previewDisabled={descriptionEmpty}
                  />
                  {settingsSummary}
                </div>
              )}
            </ComfyuiGenerationStack>
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
              onSelectPanel={
                angleId ? (optionId, panel) => handleSelectPanel(optionId, panel) : undefined
              }
              onSplitPair={
                angleId && splitPairAngles
                  ? (optionId) => handleSplitPair(optionId)
                  : undefined
              }
              splitPairAngles={splitPairAngles}
              onSelectOption={(optionId) => void handleSelect(optionId)}
              onDismissPack={() => void dismissPack().catch(() => undefined)}
              selectLabel="Select this design"
              optionAltPrefix="Character sheet option"
            />
          )}
        </>
      )}
    </div>
  );
}
