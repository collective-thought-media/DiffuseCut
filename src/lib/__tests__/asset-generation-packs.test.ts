import { describe, expect, it } from "vitest";
import { formatAssetGenerationPackLabel } from "@/lib/asset-generation-pack-types";
import type { AssetGenerationPack } from "@/lib/asset-generation-pack-types";
import type { AssetGenerationBatch } from "@/lib/db/schema";

function mockPack(
  packNumber: number,
  status: AssetGenerationBatch["status"],
  isLatest: boolean
): AssetGenerationPack {
  return {
    packNumber,
    isLatest,
    batch: {
      id: `batch-${packNumber}`,
      status,
    } as AssetGenerationBatch,
    options: [],
  };
}

describe("formatAssetGenerationPackLabel", () => {
  it("labels archived packs as saved in status badge copy elsewhere", () => {
    expect(formatAssetGenerationPackLabel(mockPack(1, "archived", false))).toBe(
      "Pack 1"
    );
    expect(
      formatAssetGenerationPackLabel(mockPack(2, "awaiting_selection", true))
    ).toBe("Pack 2 (latest)");
  });
});
