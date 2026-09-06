"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { filterSelectableShotOptions } from "@/lib/shot-pipeline-shared";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ComfyuiGenerationStack } from "@/components/sheets/ComfyuiGenerationStack";
import { AssetGenerationOptionsGrid } from "@/components/sheets/AssetGenerationOptionsGrid";
import { SheetGenerationControls } from "@/components/sheets/SheetGenerationControls";
import { VisualStyleBadge } from "@/components/project/VisualStylePanel";
import { AsyncRefreshOverlay } from "@/components/ui/AsyncRefreshOverlay";
import { GenerationErrorAlert } from "@/components/ui/GenerationErrorAlert";
import { Button, Badge, Card } from "@/components/ui/button";
import {
  useShotPlaceholderBatch,
  formatShotPlaceholderPackLabel,
  type ShotPlaceholderBatchState,
  type UseShotPlaceholderBatchProps,
} from "@/components/storyboard/use-shot-placeholder-batch";
import { mediaUrl } from "@/lib/media-url";

const ShotPlaceholderBatchContext =
  createContext<ShotPlaceholderBatchState | null>(null);

function useShotPlaceholderContext(): ShotPlaceholderBatchState {
  const value = useContext(ShotPlaceholderBatchContext);
  if (!value) {
    throw new Error(
      "Shot placeholder components must be used within ShotPlaceholderBatchProvider"
    );
  }
  return value;
}

interface ShotPlaceholderBatchProviderProps
  extends UseShotPlaceholderBatchProps {
  children: ReactNode;
}

export function ShotPlaceholderBatchProvider({
  children,
  ...props
}: ShotPlaceholderBatchProviderProps) {
  const state = useShotPlaceholderBatch(props);
  return (
    <ShotPlaceholderBatchContext.Provider value={state}>
      {children}
    </ShotPlaceholderBatchContext.Provider>
  );
}

export function ShotReferenceInfoPanel({
  projectId,
  usesReferenceMedia = false,
  usesDualIpAdapter = false,
  usesCharacterReference = false,
  referenceMediaLabel,
  referenceMediaDetail,
  characterReferencePath,
  locationReferencePath,
}: {
  projectId?: string;
  usesReferenceMedia?: boolean;
  usesDualIpAdapter?: boolean;
  usesCharacterReference?: boolean;
  referenceMediaLabel?: string | null;
  referenceMediaDetail?: string | null;
  characterReferencePath?: string | null;
  locationReferencePath?: string | null;
}) {
  const { ipAdapterAvailable } = useShotPlaceholderContext();

  if (!usesReferenceMedia) return null;

  const showThumbs =
    Boolean(projectId) &&
    (Boolean(characterReferencePath) || Boolean(locationReferencePath));

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-sm text-muted-foreground">
      {showThumbs ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {characterReferencePath ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                Character image sent to ComfyUI
              </p>
              <div className="aspect-video overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
                <img
                  src={mediaUrl(projectId!, characterReferencePath)}
                  alt="Character reference used for this shot"
                  className="h-full w-full object-contain"
                />
              </div>
              <p className="text-xs text-amber-200/90">
                This exact file locks face and wardrobe. Prompt and negative text
                cannot override it. If this is still the old humanoid, replace
                that angle&apos;s reference on the character page.
              </p>
            </div>
          ) : null}
          {locationReferencePath ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                Location plate sent to ComfyUI
              </p>
              <div className="aspect-video overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
                <img
                  src={mediaUrl(projectId!, locationReferencePath)}
                  alt="Location reference used for this shot"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {ipAdapterAvailable !== false ? (
        <>
          {usesDualIpAdapter ? (
            <>
              Dual IP-Adapter sends separate character and location reference
              images. Your shot prompt sets composition and action.
            </>
          ) : (
            <>
              IP-Adapter uses{" "}
              {referenceMediaLabel
                ? `"${referenceMediaLabel}"`
                : "the selected visual reference"}{" "}
              as the image input. Your shot prompt sets composition and action.
            </>
          )}
          {usesCharacterReference ? (
            <span className="mt-2 block text-xs text-sky-200/90">
              Character likeness is driven by the character image above, not by
              negative prompts. Clear or replace that image if the wrong face
              keeps appearing.
            </span>
          ) : null}
          {referenceMediaDetail ? (
            <span className="mt-2 block text-xs">{referenceMediaDetail}</span>
          ) : null}
        </>
      ) : (
        <>
          Reference media is available but IP-Adapter is not installed on your
          ComfyUI server. Generation uses your prompt and cast descriptions only.
          Install ComfyUI_IPAdapter_plus for reference-guided frames.
        </>
      )}
    </div>
  );
}

interface ShotPlaceholderControlsProps {
  projectId: string;
  visualStyleJson?: string | null;
  usesReferenceMedia?: boolean;
  usesDualIpAdapter?: boolean;
  referenceMediaLabel?: string | null;
}

export function ShotPlaceholderControls({
  projectId,
  visualStyleJson,
  usesReferenceMedia = false,
  usesDualIpAdapter = false,
}: ShotPlaceholderControlsProps) {
  const {
    batch,
    sampleCount,
    setSampleCount,
    promptPreview,
    negativePreview,
    previewLoading,
    previewError,
    stillNegativePrompt,
    onStillNegativePromptChange,
    showPreview,
    togglePromptPreview,
    comfyuiOk,
    setComfyuiOk,
    stackReady,
    setStackReady,
    ipAdapterAvailable,
    setIpAdapterAvailable,
    selectingId,
    expanded,
    setExpanded,
    toggleExpanded,
    descriptionEmpty,
    isGenerating,
    awaitingSelection,
    generateLabel,
    ready,
    readyHint,
    displayError,
    canRegenerate,
    handleGenerate,
    dismissError,
  } = useShotPlaceholderContext();

  return (
    <div className="relative mt-8 space-y-4 border-t border-neutral-800 pt-8">
      <AsyncRefreshOverlay
        active={selectingId !== null}
        message="Saving placeholder…"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <h3 className="text-base font-semibold text-muted-foreground">
            Shot Image Generator
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

      {displayError && (
        <GenerationErrorAlert
          message={displayError}
          onDismiss={() => void dismissError()}
        />
      )}

      {expanded && (
        <>
          <p className="text-sm text-muted-foreground">
            Generate storyboard frame options from this shot&apos;s prompt,
            location, and cast. Pick one image to save as the shot placeholder.{" "}
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
              or open{" "}
              <Link href="/setup" className="text-primary hover:underline">
                System Status
              </Link>
              .
            </div>
          )}

          {descriptionEmpty && (
            <p className="text-sm text-muted-foreground">
              Add a shot prompt, location, or character cast first.
            </p>
          )}

          {!descriptionEmpty && (
            <ComfyuiGenerationStack
              projectId={projectId}
              workflowNameOverride={
                usesReferenceMedia
                  ? ipAdapterAvailable
                    ? usesDualIpAdapter
                      ? "Shot frame (dual IP-Adapter)"
                      : "Shot frame from reference (IP-Adapter)"
                    : "Shot frame (prompt driven, no IP-Adapter)"
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
                    stillNegativePrompt={stillNegativePrompt}
                    onStillNegativePromptChange={onStillNegativePromptChange}
                    extraNegativeLabel="Extra negative prompt (this shot)"
                    extraNegativePlaceholder="Optional. Appended to this shot's still generation negatives only."
                    previewEmptyHint="No preview text returned. Check the shot prompt and try again."
                    onGenerate={() => void handleGenerate(canRegenerate)}
                    previewDisabled={descriptionEmpty}
                  />
                  {settingsSummary}
                </div>
              )}
            </ComfyuiGenerationStack>
          )}
        </>
      )}
    </div>
  );
}

interface ShotPlaceholderOptionsPanelProps {
  projectId: string;
}

export function ShotPlaceholderOptionsPanel({
  projectId,
}: ShotPlaceholderOptionsPanelProps) {
  const {
    batch,
    options,
    packs,
    viewingBatchId,
    selectPack,
    activeBatchId,
    canSelectFromPack,
    showOptions,
    handleSelect,
    selectingId,
    dismissOptions,
    expanded,
    isGenerating,
    handleInstructionEdit,
    handleSendToComfyui,
    sendingToComfyId,
    comfySendResult,
  } = useShotPlaceholderContext();
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState("");

  const displayOptions = useMemo(
    () => filterSelectableShotOptions(options),
    [options]
  );

  if (!showOptions || !expanded) return null;

  const canDismiss =
    batch &&
    (batch.status === "awaiting_selection" || batch.status === "archived") &&
    displayOptions.some((option) => option.status === "completed");

  const packStatusLabel = (status: NonNullable<typeof batch>["status"]) => {
    if (status === "archived") return "saved";
    return status.replace(/_/g, " ");
  };

  return (
    <Card className="mb-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h3 className="entity-card-subheader mb-0">Generated options</h3>
          <p className="text-xs text-muted-foreground">
            Each regenerate saves a new pack. Switch between packs to compare
            and pick from any earlier set.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {batch && (
            <Badge
              variant={
                batch.status === "awaiting_selection" || batch.status === "archived"
                  ? "success"
                  : batch.status === "failed"
                    ? "error"
                    : "warning"
              }
            >
              {packStatusLabel(batch.status)}
            </Badge>
          )}
          {canDismiss && (
            <Button size="sm" variant="outline" onClick={() => void dismissOptions()}>
              Remove pack
            </Button>
          )}
        </div>
      </div>

      {packs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {packs.map((pack) => {
            const isViewing = pack.batch.id === viewingBatchId;
            const isActive = pack.batch.id === activeBatchId;
            return (
              <Button
                key={pack.batch.id}
                size="sm"
                variant={isViewing ? "default" : "outline"}
                onClick={() => selectPack(pack.batch.id)}
              >
                {formatShotPlaceholderPackLabel(pack)}
                {isActive &&
                (pack.batch.status === "queued" ||
                  pack.batch.status === "running") ? (
                  <span className="ml-1 opacity-80">(generating)</span>
                ) : null}
              </Button>
            );
          })}
        </div>
      )}

      <AssetGenerationOptionsGrid
        projectId={projectId}
        options={displayOptions}
        awaitingSelection={canSelectFromPack}
        selectingId={selectingId}
        onSelect={(optionId) => void handleSelect(optionId)}
        selectLabel="Use this image"
        selectedLabel="Current placeholder"
        optionAltPrefix="Shot option"
        showCompositedStaleHint
        selectedOptionId={
          displayOptions.find((option) => option.selected)?.id ?? null
        }
        renderOptionActions={(option) => (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isGenerating}
                onClick={() => {
                  if (editingOptionId === option.id) {
                    setEditingOptionId(null);
                  } else {
                    setEditingOptionId(option.id);
                    setEditInstruction("");
                  }
                }}
              >
                {editingOptionId === option.id ? "Cancel edit" : "Edit with instruction"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={sendingToComfyId === option.id}
                onClick={() => void handleSendToComfyui(option.id)}
              >
                {sendingToComfyId === option.id
                  ? "Sending…"
                  : "Send to ComfyUI"}
              </Button>
            </div>
            {editingOptionId === option.id ? (
              <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-2">
                <textarea
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  rows={2}
                  placeholder={'Describe one change, e.g. change the sign to read "CORNER DELI" or remove the parked car'}
                  className="w-full rounded-md border border-neutral-800 bg-black/40 p-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!editInstruction.trim() || isGenerating}
                    onClick={() => {
                      void handleInstructionEdit(option.id, editInstruction);
                      setEditingOptionId(null);
                    }}
                  >
                    Apply edit (new pack)
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Runs Qwen Image Edit on this image only.
                  </span>
                </div>
              </div>
            ) : null}
            {comfySendResult?.optionId === option.id ? (
              <p className="text-xs text-muted-foreground">
                Uploaded to ComfyUI inputs as {comfySendResult.filename}. Open{" "}
                <a
                  href={comfySendResult.endpointUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  ComfyUI
                </a>{" "}
                and load it with a LoadImage node. Tip: dragging the saved PNG
                from your project folder into ComfyUI rebuilds the exact
                workflow that generated it.
              </p>
            ) : null}
          </div>
        )}
      />
    </Card>
  );
}

/** @deprecated Use ShotPlaceholderBatchProvider + Controls + OptionsPanel */
export function ShotPlaceholderGenerator(
  props: UseShotPlaceholderBatchProps & {
    projectId: string;
    visualStyleJson?: string | null;
    usesReferenceMedia?: boolean;
    referenceMediaLabel?: string | null;
  }
) {
  const {
    projectId,
    visualStyleJson,
    usesReferenceMedia,
    referenceMediaLabel,
    ...batchProps
  } = props;

  return (
    <ShotPlaceholderBatchProvider projectId={projectId} {...batchProps}>
      <ShotPlaceholderControls
        projectId={projectId}
        visualStyleJson={visualStyleJson}
        usesReferenceMedia={usesReferenceMedia}
        referenceMediaLabel={referenceMediaLabel}
      />
      <ShotPlaceholderOptionsPanel projectId={projectId} />
    </ShotPlaceholderBatchProvider>
  );
}
