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
import { detectVirtualBackdropLocation } from "@/lib/location-backdrop";
import {
  LocationIpAdapterControls,
  defaultLocationIpAdapterSettings,
  locationIpAdapterSettingsToApi,
  type LocationIpAdapterSettings,
} from "@/components/sheets/LocationIpAdapterControls";
import { ComfyuiGenerationStack } from "@/components/sheets/ComfyuiGenerationStack";
import { SheetGenerationControls } from "@/components/sheets/SheetGenerationControls";
import { VisualStyleBadge } from "@/components/project/VisualStylePanel";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { AsyncRefreshOverlay } from "@/components/ui/AsyncRefreshOverlay";
import { GenerationErrorAlert } from "@/components/ui/GenerationErrorAlert";
import { Button, Badge } from "@/components/ui/button";

function formatBatchFailureMessage(
  batch: AssetGenerationBatch,
  options: AssetGenerationOption[]
): string {
  const optionErrors = [
    ...new Set(
      options
        .map((option) => option.errorMessage)
        .filter((message): message is string => Boolean(message))
    ),
  ];
  const primary =
    optionErrors[0] ?? batch.errorMessage ?? "Generation failed";
  if (optionErrors.length <= 1) {
    return formatComfyuiError(primary);
  }
  return formatComfyuiError(
    [primary, ...optionErrors.slice(1)].join("\n\n")
  );
}

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

function statusVariant(
  status: AssetGenerationOption["status"]
): "default" | "success" | "warning" | "error" {
  if (status === "completed") return "success";
  if (status === "running") return "warning";
  if (status === "failed" || status === "cancelled") return "error";
  return "default";
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
  const [ipAdapterAvailable, setIpAdapterAvailable] = useState<boolean | null>(
    null
  );
  const [ipAdapterSettings, setIpAdapterSettings] =
    useState<LocationIpAdapterSettings>(() =>
      defaultLocationIpAdapterSettings(referenceDescription, locationName)
    );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!hasReference);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );

  const apiBase = useMemo(
    () =>
      `/api/projects/${projectId}/locations/${locationId}/states/${stateId}/angles/${angleId}`,
    [projectId, locationId, stateId, angleId]
  );

  const loadBatch = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/sheet-batch`);
      if (res.status === 404) {
        setBatch(null);
        setOptions([]);
        setError(null);
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
    if (!locationName.trim() || !referenceDescription.trim()) return;
    try {
      const params = new URLSearchParams({
        name: locationName,
        description: referenceDescription,
        projectId,
      });
      if (usesEstablishingAnchor) {
        params.set("anchorMode", "true");
      }
      const res = await fetch(
        `/api/prompt-preview/location-reference?${params.toString()}`
      );
      const data = await res.json();
      if (res.ok) {
        setPromptPreview(data.processedPrompt);
        setNegativePreview(data.negativePrompt);
      }
    } catch {
      /* ignore preview errors */
    }
  }, [locationName, referenceDescription, projectId, usesEstablishingAnchor]);

  useEffect(() => {
    setIpAdapterSettings(
      defaultLocationIpAdapterSettings(referenceDescription, locationName)
    );
  }, [angleId, referenceDescription, locationName]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch, angleId]);

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
            setError(null);
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
      const message = hasReference
        ? "Discard the current options and generate a new batch? Your saved reference stays until you pick a new design."
        : "Discard the current options and generate a new batch using the project's current visual look?";
      if (!confirm(message)) return;
    }
    setSubmitting(true);
    submittingRef.current = true;
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setError(null);
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
        "Use this image as the reference for this angle? Other options will be deleted."
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

  const descriptionEmpty = !referenceDescription.trim();
  const backdropMode = detectVirtualBackdropLocation(
    locationName,
    referenceDescription
  );
  const isGenerating =
    submitting ||
    batch?.status === "queued" ||
    batch?.status === "running";
  const batchFailed = batch?.status === "failed";
  const awaitingSelection = batch?.status === "awaiting_selection";
  const canRegenerate = awaitingSelection;
  const generateLabel =
    canRegenerate && !isGenerating
      ? "Regenerate reference options"
      : batchFailed
        ? "Try again"
        : "Generate reference options";
  const ready =
    !descriptionEmpty &&
    comfyuiOk === true &&
    stackReady &&
    !isGenerating;
  const displayError =
    error ??
    (batchFailed ? formatBatchFailureMessage(batch, options) : null);

  async function dismissError() {
    setError(null);
    if (batchFailed) {
      try {
        await fetch(`${apiBase}/sheet-batch`, { method: "DELETE" });
        setBatch(null);
        setOptions([]);
      } catch {
        /* keep visible batch if dismiss fails */
      }
    }
  }

  useEffect(() => {
    if (displayError || isGenerating || awaitingSelection || submitting) {
      setExpanded(true);
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
  ]);

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
            Location Reference Generator
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
        <GenerationErrorAlert message={displayError} onDismiss={() => void dismissError()} />
      )}

      {expanded && (
        <>
      <p className="text-sm text-muted-foreground">
        Generate environment reference options for this camera angle via ComfyUI.
        Pick one image to save as the reference for this angle.{" "}
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
          Seamless backdrop detected. Describe the surface color and tone the
          camera sees, not studio lights or equipment. Example angle view:
          &quot;Medium shot, neutral gray seamless fills the entire frame edge
          to edge, soft even light, no floor visible, no equipment.&quot;
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
                description sets crop and framing. Tighter angles use a lighter
                anchor so they stay in-camera plates, not studio setup shots.
              </>
            ) : (
              <>
                This angle uses IP-Adapter with your saved{" "}
                {anchorAngleName ? `"${anchorAngleName}"` : "establishing"}{" "}
                reference to match materials, weather, and scale. Your angle
                description sets the camera and framing. Close-ups use a lighter
                anchor so they are not copies of the wide master.
              </>
            )
          ) : (
            <>
              Without IP-Adapter, this angle generates from your description
              only (txt2img). It can produce a new camera angle, but it will
              not visually lock to your saved{" "}
              {anchorAngleName ? `"${anchorAngleName}"` : "establishing"}{" "}
              reference. Install ComfyUI_IPAdapter_plus on your ComfyUI server
              for set-matched reframes from the establishing shot.
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
                disabled={descriptionEmpty || isGenerating}
                showPreview={showPreview}
                onTogglePreview={() => setShowPreview((value) => !value)}
                promptPreview={promptPreview}
                negativePreview={negativePreview}
                onGenerate={() => void handleGenerate(canRegenerate)}
              />
              {settingsSummary}
            </div>
          )}
        </ComfyuiGenerationStack>
      )}

      {batch && (isGenerating || awaitingSelection || batchFailed) && (
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
                        alt: `Location reference option ${option.variantIndex + 1}`,
                      })
                    }
                    className="block w-full cursor-zoom-in overflow-hidden rounded-lg bg-black transition hover:opacity-90"
                  >
                    <div className="aspect-video w-full bg-black/40">
                      <img
                        src={previewSrc}
                        alt={`Location reference option ${option.variantIndex + 1}`}
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
                      : "Select this image"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
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
