import { describe, expect, it } from "vitest";
import {
  resolveLocationAnchorAngleName,
  resolveLocationAnchorReferencePath,
  type LocationStatePreview,
} from "@/lib/location-preview";

function makeState(
  angles: Array<{
    id: string;
    name: string;
    referencePath?: string | null;
  }>
): LocationStatePreview {
  return {
    id: "state-1",
    locationId: "loc-1",
    name: "Default look",
    lookDescription: "",
    timelineNote: "",
    sortOrder: 0,
    referencePath: null,
    referenceKind: null,
    referenceSource: null,
    createdAt: 0,
    updatedAt: 0,
    angles: angles.map((angle, index) => ({
      id: angle.id,
      locationStateId: "state-1",
      name: angle.name,
      viewDescription: "",
      sortOrder: index,
      referencePath: angle.referencePath ?? null,
      referenceKind: angle.referencePath ? "image" : null,
      referenceSource: angle.referencePath ? "comfyui" : null,
      createdAt: 0,
      updatedAt: 0,
    })),
  };
}

describe("resolveLocationAnchorReferencePath", () => {
  it("prefers establishing wide when multiple references exist", () => {
    const state = makeState([
      { id: "a1", name: "Establishing wide", referencePath: "wide.png" },
      { id: "a2", name: "Stair detail", referencePath: "stairs.png" },
    ]);

    expect(resolveLocationAnchorReferencePath(state, "a2")).toBe("wide.png");
    expect(resolveLocationAnchorAngleName(state, "a2")).toBe("Establishing wide");
  });

  it("excludes the current angle", () => {
    const state = makeState([
      { id: "a1", name: "Establishing wide", referencePath: "wide.png" },
    ]);

    expect(resolveLocationAnchorReferencePath(state, "a1")).toBeNull();
  });

  it("falls back to first saved reference when no establishing angle", () => {
    const state = makeState([
      { id: "a1", name: "Front facade", referencePath: "front.png" },
      { id: "a2", name: "Interior hall" },
    ]);

    expect(resolveLocationAnchorReferencePath(state, "a2")).toBe("front.png");
  });
});
