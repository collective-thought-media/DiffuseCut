import { describe, expect, it } from "vitest";
import { buildCropPadFilter } from "@/lib/services/image-panel-crop";

describe("image panel crop", () => {
  it("builds left panel crop and pad filter for 16:9", () => {
    const filter = buildCropPadFilter("left", 1344, 768, "0x808080");
    expect(filter).toContain("crop=iw/2:ih:0:0");
    expect(filter).toContain("scale=1344:768");
    expect(filter).toContain("pad=1344:768");
  });

  it("builds right panel crop filter", () => {
    const filter = buildCropPadFilter("right", 1344, 768, "0x808080");
    expect(filter).toContain("crop=iw/2:ih:iw/2:0");
  });
});
