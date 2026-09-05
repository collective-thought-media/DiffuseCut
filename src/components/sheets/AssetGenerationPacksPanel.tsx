"use client";

import type {
  AssetGenerationBatch,
  AssetGenerationOption,
} from "@/lib/db/schema";
import {
  formatAssetGenerationPackLabel,
  type AssetGenerationPack,
} from "@/lib/asset-generation-pack-types";
import { AssetGenerationOptionsGrid } from "@/components/sheets/AssetGenerationOptionsGrid";
import { Button, Badge, Card } from "@/components/ui/button";

export interface AssetGenerationPacksPanelProps {
  projectId: string;
  packs: AssetGenerationPack[];
  batch: AssetGenerationBatch | null;
  options: AssetGenerationOption[];
  viewingBatchId: string | null;
  activeBatchId: string | null;
  onSelectPack: (batchId: string) => void;
  awaitingSelection?: boolean;
  canSelectFromPack?: boolean;
  selectingId?: string | null;
  onSelectOption?: (optionId: string) => void;
  onSelectPanel?: (
    optionId: string,
    panel: "full" | "left" | "right"
  ) => void | Promise<void>;
  onSplitPair?: (optionId: string) => void | Promise<void>;
  splitPairAngles?: { frontAngleId: string; backAngleId: string } | null;
  onDismissPack?: () => void;
  selectLabel?: string;
  selectedLabel?: string;
  optionAltPrefix?: string;
  showCompositedStaleHint?: boolean;
  dismissConfirmMessage?: string;
  headerDescription?: string;
}

export function AssetGenerationPacksPanel({
  projectId,
  packs,
  batch,
  options,
  viewingBatchId,
  activeBatchId,
  onSelectPack,
  awaitingSelection = false,
  canSelectFromPack = false,
  selectingId = null,
  onSelectOption,
  onSelectPanel,
  onSplitPair,
  splitPairAngles = null,
  onDismissPack,
  selectLabel = "Use this image",
  selectedLabel = "Current selection",
  optionAltPrefix = "Option",
  showCompositedStaleHint = false,
  headerDescription = "Each regenerate saves a new pack. Switch between packs to compare and pick from any earlier set.",
}: AssetGenerationPacksPanelProps) {
  if (packs.length === 0 && (!batch || options.length === 0)) return null;

  const canDismiss =
    batch &&
    onDismissPack &&
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
          <p className="text-xs text-muted-foreground">{headerDescription}</p>
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
            <Button size="sm" variant="outline" onClick={() => onDismissPack()}>
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
                onClick={() => onSelectPack(pack.batch.id)}
              >
                {formatAssetGenerationPackLabel(pack)}
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
        options={options}
        awaitingSelection={canSelectFromPack || awaitingSelection}
        selectingId={selectingId}
        onSelect={onSelectOption}
        onSelectPanel={onSelectPanel}
        onSplitPair={onSplitPair}
        splitPairAngles={splitPairAngles}
        selectLabel={selectLabel}
        selectedLabel={selectedLabel}
        optionAltPrefix={optionAltPrefix}
        showCompositedStaleHint={showCompositedStaleHint}
      />
    </Card>
  );
}
