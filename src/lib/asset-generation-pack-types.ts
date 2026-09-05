import type {
  AssetGenerationBatch,
  AssetGenerationOption,
} from "@/lib/db/schema";

export type AssetGenerationPack = {
  batch: AssetGenerationBatch;
  options: AssetGenerationOption[];
  packNumber: number;
  isLatest: boolean;
};

export function formatAssetGenerationPackLabel(
  pack: AssetGenerationPack
): string {
  const suffix = pack.isLatest ? " (latest)" : "";
  return `Pack ${pack.packNumber}${suffix}`;
}
