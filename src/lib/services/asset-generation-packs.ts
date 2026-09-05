import type { AssetGenerationBatch } from "@/lib/db/schema";
import {
  archiveAssetBatch,
  getBatchWithOptions,
  listRetainedBatchesForEntity,
} from "@/lib/services/asset-generation-queue";
import type { AssetGenerationPack } from "@/lib/asset-generation-pack-types";

export type { AssetGenerationPack } from "@/lib/asset-generation-pack-types";
export { formatAssetGenerationPackLabel } from "@/lib/asset-generation-pack-types";

export function listAssetGenerationPacks(
  entityType: AssetGenerationBatch["entityType"],
  entityId: string,
  getDisplayBatch: () => AssetGenerationBatch | null
): AssetGenerationPack[] {
  const retained = listRetainedBatchesForEntity(entityType, entityId);
  const active = getDisplayBatch();

  const merged = [...retained];
  if (active && !merged.some((batch) => batch.id === active.id)) {
    merged.push(active);
  }
  merged.sort((a, b) => a.createdAt - b.createdAt);

  return merged.flatMap((batch, index) => {
    const data = getBatchWithOptions(batch.id);
    if (!data) return [];
    return [
      {
        batch: data.batch,
        options: data.options,
        packNumber: index + 1,
        isLatest: batch.id === merged[merged.length - 1]?.id,
      },
    ];
  });
}

export function getAssetGenerationBatchView(
  entityType: AssetGenerationBatch["entityType"],
  entityId: string,
  getDisplayBatch: () => AssetGenerationBatch | null,
  batchId?: string | null
): {
  batch: AssetGenerationBatch | null;
  options: AssetGenerationPack["options"];
  packs: AssetGenerationPack[];
  activeBatchId: string | null;
} {
  const packs = listAssetGenerationPacks(
    entityType,
    entityId,
    getDisplayBatch
  );
  const active = getDisplayBatch();

  if (packs.length === 0) {
    const active = getDisplayBatch();
    const activeData = active ? getBatchWithOptions(active.id) : null;
    return {
      batch: activeData?.batch ?? null,
      options: activeData?.options ?? [],
      packs: [],
      activeBatchId: active?.id ?? null,
    };
  }

  const viewed =
    (batchId ? packs.find((pack) => pack.batch.id === batchId) : null) ??
    (active ? packs.find((pack) => pack.batch.id === active.id) : null) ??
    packs[packs.length - 1];

  return {
    batch: viewed.batch,
    options: viewed.options,
    packs,
    activeBatchId: active?.id ?? null,
  };
}

export function archiveAssetGenerationBatch(batch: AssetGenerationBatch): void {
  if (batch.status === "archived") return;
  archiveAssetBatch(batch.id);
}

export { archiveBatchAfterReferenceSelection } from "@/lib/services/asset-generation-queue";

export function supersedeAssetGenerationBatch(
  priorBatch: AssetGenerationBatch,
  discard: (batch: AssetGenerationBatch) => void
): void {
  if (
    priorBatch.status === "awaiting_selection" ||
    priorBatch.status === "failed" ||
    priorBatch.status === "archived"
  ) {
    archiveAssetGenerationBatch(priorBatch);
    return;
  }
  discard(priorBatch);
}
