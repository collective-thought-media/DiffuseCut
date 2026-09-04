"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { mediaUrl } from "@/lib/media-url";
import { formatComfyuiError } from "@/lib/services/comfyui-errors";
import { ComfyuiGenerationStack } from "@/components/sheets/ComfyuiGenerationStack";
import { SheetGenerationControls } from "@/components/sheets/SheetGenerationControls";
import { VisualStyleBadge } from "@/components/project/VisualStylePanel";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { AsyncRefreshOverlay } from "@/components/ui/AsyncRefreshOverlay";
import { GenerationErrorAlert } from "@/components/ui/GenerationErrorAlert";
import { Button, Badge, Card } from "@/components/ui/button";
import {
  useShotPlaceholderBatch,
  formatShotPlaceholderPackLabel,
  type ShotPlaceholderBatchState,
  type UseShotPlaceholderBatchProps,
} from "@/components/storyboard/use-shot-placeholder-batch";

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

function statusVariant(
  status: ShotPlaceholderBatchState["options"][number]["status"]
): "default" | "success" | "warning" | "error" {
  if (status === "completed") return "success";
  if (status === "running") return "warning";
  if (status === "failed" || status === "cancelled") return "error";
  return "default";
}

export function ShotReferenceInfoPanel({
  usesReferenceMedia = false,
  usesDualIpAdapter = false,
  usesCharacterReference = false,
  referenceMediaLabel,
  referenceMediaDetail,
}: {
  usesReferenceMedia?: boolean;
  usesDualIpAdapter?: boolean;
  usesCharacterReference?: boolean;
  referenceMediaLabel?: string | null;
  referenceMediaDetail?: string | null;
}) {
  const { ipAdapterAvailable } = useShotPlaceholderContext();

  if (!usesReferenceMedia) return null;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-sm text-muted-foreground">
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
              Character reference locks face and wardrobe. Add outfit and
              appearance details on the character state&apos;s look description
              for a closer match.
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
    lightbox,
    setLightbox,
  } = useShotPlaceholderContext();

  if (!showOptions) return null;

  const canDismiss =
    batch &&
    (batch.status === "awaiting_selection" || batch.status === "archived") &&
    options.some((option) => option.status === "completed");

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                      alt: `Shot option ${option.variantIndex + 1}`,
                    })
                  }
                  className="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-neutral-800 bg-black transition hover:opacity-90"
                >
                  <div className="aspect-video w-full bg-black/40">
                    <img
                      src={previewSrc}
                      alt={`Shot option ${option.variantIndex + 1}`}
                      className="ui-image-enter h-full w-full object-contain"
                    />
                  </div>
                </button>
              ) : (
                <div className="space-y-2 rounded-lg border border-neutral-800 bg-black/40 p-4">
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

              {canSelectFromPack && option.status === "completed" && (
                option.selected ? (
                  <Badge variant="success">Current placeholder</Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void handleSelect(option.id)}
                    disabled={selectingId === option.id}
                  >
                    {selectingId === option.id
                      ? "Selecting…"
                      : "Use this image"}
                  </Button>
                )
              )}
            </div>
          );
        })}
      </div>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
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
