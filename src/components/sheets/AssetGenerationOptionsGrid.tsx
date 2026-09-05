"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AssetGenerationOption } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { formatComfyuiError } from "@/lib/services/comfyui-errors";
import {
  formatHeartbeatAge,
  resolveShotOptionDisplayProgress,
} from "@/lib/asset-generation-status";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { Button, Badge } from "@/components/ui/button";

function statusVariant(
  status: AssetGenerationOption["status"]
): "default" | "success" | "warning" | "error" {
  if (status === "completed") return "success";
  if (status === "running") return "warning";
  if (status === "failed" || status === "cancelled") return "error";
  return "default";
}

export interface AssetGenerationOptionsGridProps {
  projectId: string;
  options: AssetGenerationOption[];
  /** When true, show select buttons for completed options. */
  awaitingSelection?: boolean;
  selectingId?: string | null;
  /** When set, show left/right panel and split-to-pair actions for diptych options. */
  splitPairAngles?: { frontAngleId: string; backAngleId: string } | null;
  onSelectPanel?: (
    optionId: string,
    panel: "full" | "left" | "right"
  ) => void | Promise<void>;
  onSplitPair?: (optionId: string) => void | Promise<void>;
  /** @deprecated use onSelectPanel */
  onSelect?: (optionId: string) => void;
  selectLabel?: string;
  selectingLabel?: string;
  selectedLabel?: string;
  optionAltPrefix?: string;
  /** Show composited-pipeline stale hint during long runs. */
  showCompositedStaleHint?: boolean;
  /** When set, marks this option id as the current saved reference. */
  selectedOptionId?: string | null;
  /** Extra per-option actions rendered under completed options. */
  renderOptionActions?: (option: AssetGenerationOption) => ReactNode;
}

export function AssetGenerationOptionsGrid({
  projectId,
  options,
  awaitingSelection = false,
  selectingId = null,
  onSelect,
  onSelectPanel,
  onSplitPair,
  splitPairAngles = null,
  selectLabel = "Use this image",
  selectingLabel = "Selecting…",
  selectedLabel = "Current selection",
  optionAltPrefix = "Option",
  showCompositedStaleHint = false,
  selectedOptionId = null,
  renderOptionActions,
}: AssetGenerationOptionsGridProps) {
  const [activityNow, setActivityNow] = useState(() => Date.now());
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );

  const isGenerating = options.some(
    (option) => option.status === "queued" || option.status === "running"
  );

  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => setActivityNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => a.variantIndex - b.variantIndex),
    [options]
  );

  if (sortedOptions.length === 0) return null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedOptions.map((option) => {
          const previewSrc = option.outputPath
            ? mediaUrl(projectId, option.outputPath)
            : null;
          const display = resolveShotOptionDisplayProgress(
            option,
            options,
            activityNow
          );
          const progressPct = Math.round(display.progress * 100);
          const heartbeat = formatHeartbeatAge(display.heartbeatAt, activityNow);
          const isSelected =
            selectedOptionId != null && option.id === selectedOptionId;

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
                      alt: `${optionAltPrefix} ${option.variantIndex + 1}`,
                    })
                  }
                  className="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-neutral-800 bg-black transition hover:opacity-90"
                >
                  <div className="aspect-video w-full bg-black/40">
                    <img
                      src={previewSrc}
                      alt={`${optionAltPrefix} ${option.variantIndex + 1}`}
                      className="ui-image-enter h-full w-full object-contain"
                    />
                  </div>
                </button>
              ) : (
                <div
                  className="space-y-2 rounded-lg border border-neutral-800 bg-black/40 p-4"
                  role="status"
                  aria-live="polite"
                >
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className={`h-full bg-primary transition-all duration-300 ${
                        display.isActive && progressPct < 95
                          ? "animate-pulse"
                          : ""
                      }`}
                      style={{
                        width: `${Math.max(progressPct, display.isActive ? 8 : 0)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {display.statusMessage}
                    {heartbeat ? ` (${heartbeat})` : null}
                  </p>
                  {showCompositedStaleHint && display.isStale ? (
                    <p className="text-xs text-amber-300/90">
                      No ComfyUI update in a while. rembg cutout and integration
                      passes can take several minutes on the GPU.
                    </p>
                  ) : null}
                </div>
              )}

              {option.errorMessage && (
                <p className="text-xs text-red-400">
                  {formatComfyuiError(option.errorMessage)}
                </p>
              )}

              {awaitingSelection &&
                option.status === "completed" &&
                (onSelect || onSelectPanel || onSplitPair) &&
                (isSelected || option.selected ? (
                  <Badge variant="success">{selectedLabel}</Badge>
                ) : splitPairAngles && onSplitPair ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-neutral-400">
                      Double portrait: left panel saves to the front angle, right
                      panel saves to the back angle. Each panel is padded to your
                      project reference ratio.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => void onSplitPair(option.id)}
                      disabled={selectingId === option.id}
                    >
                      {selectingId === option.id
                        ? selectingLabel
                        : "Use this design (front + back)"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        onSelectPanel
                          ? void onSelectPanel(option.id, "full")
                          : onSelect?.(option.id)
                      }
                      disabled={selectingId === option.id}
                    >
                      {selectingId === option.id ? selectingLabel : selectLabel}
                    </Button>
                    {onSelectPanel && !splitPairAngles ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void onSelectPanel(option.id, "left")}
                          disabled={selectingId === option.id}
                        >
                          Use left panel only
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void onSelectPanel(option.id, "right")}
                          disabled={selectingId === option.id}
                        >
                          Use right panel only
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}

              {option.status === "completed" && renderOptionActions
                ? renderOptionActions(option)
                : null}
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
    </>
  );
}
