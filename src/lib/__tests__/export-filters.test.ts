import { describe, expect, it } from "vitest";
import {
  buildExactSizeVideoFilter,
  buildExportAudioMixGraph,
  buildOverlayDrawtextFilters,
  escapeDrawtextFontPath,
  escapeDrawtextText,
  EXPORT_LOUDNORM_FILTER,
  resolveOutputFrameSize,
} from "@/lib/services/export-filters";

describe("escapeDrawtextText", () => {
  it("escapes backslashes, percents, colons, and quotes", () => {
    expect(escapeDrawtextText("plain text")).toBe("plain text");
    expect(escapeDrawtextText("50% off: now")).toBe("50\\% off\\: now");
    expect(escapeDrawtextText("it's here")).toBe("it'\\''s here");
    expect(escapeDrawtextText("a\\b")).toBe("a\\\\b");
  });
});

describe("escapeDrawtextFontPath", () => {
  it("normalizes slashes and escapes drive colons", () => {
    expect(escapeDrawtextFontPath("C:\\repo\\assets\\fonts\\Bold.ttf")).toBe(
      "C\\:/repo/assets/fonts/Bold.ttf"
    );
  });
});

describe("buildOverlayDrawtextFilters", () => {
  it("builds one filter per overlay with frame-to-second enable windows", () => {
    const filters = buildOverlayDrawtextFilters(
      [
        { text: "Last Train Home", startFrame: 0, endFrame: 48 },
        { text: "The End", startFrame: 96, endFrame: 144 },
      ],
      24,
      "C:\\repo\\assets\\fonts\\Bold.ttf"
    );

    expect(filters).toHaveLength(2);
    expect(filters[0]).toContain("drawtext=fontfile='C\\:/repo/assets/fonts/Bold.ttf'");
    expect(filters[0]).toContain("text='Last Train Home'");
    expect(filters[0]).toContain("enable='between(t,0.000,2.000)'");
    expect(filters[0]).toContain("fontcolor=white");
    expect(filters[0]).toContain("boxcolor=black@0.7");
    expect(filters[0]).toContain("x=(w-text_w)/2");
    expect(filters[0]).toContain("y=h*0.25");
    expect(filters[1]).toContain("enable='between(t,4.000,6.000)'");
  });

  it("escapes overlay text and skips empty overlays", () => {
    const filters = buildOverlayDrawtextFilters(
      [
        { text: "Mira's 100% moment: go", startFrame: 12, endFrame: 36 },
        { text: "   ", startFrame: 0, endFrame: 10 },
      ],
      24,
      "/fonts/Bold.ttf"
    );

    expect(filters).toHaveLength(1);
    expect(filters[0]).toContain("text='Mira'\\''s 100\\% moment\\: go'");
    expect(filters[0]).toContain("enable='between(t,0.500,1.500)'");
  });
});

describe("buildExportAudioMixGraph", () => {
  it("mixes shot audio with tracks at their volume and normalizes loudness", () => {
    const graph = buildExportAudioMixGraph([1, 0.5]);

    expect(graph.outputLabel).toBe("aout");
    expect(graph.filters).toEqual([
      "[1:a:0]volume=1[trk0]",
      "[2:a:0]volume=0.5[trk1]",
      "[0:a:0][trk0][trk1]amix=inputs=3:duration=first[mixed]",
      `[mixed]${EXPORT_LOUDNORM_FILTER}[aout]`,
    ]);
  });

  it("clamps out-of-range volumes", () => {
    const graph = buildExportAudioMixGraph([-1, 5]);
    expect(graph.filters[0]).toBe("[1:a:0]volume=0[trk0]");
    expect(graph.filters[1]).toBe("[2:a:0]volume=2[trk1]");
  });

  it("handles zero tracks by normalizing shot audio alone", () => {
    const graph = buildExportAudioMixGraph([]);
    expect(graph.filters).toEqual([
      "[0:a:0]amix=inputs=1:duration=first[mixed]",
      `[mixed]${EXPORT_LOUDNORM_FILTER}[aout]`,
    ]);
  });
});

describe("buildExactSizeVideoFilter", () => {
  it("covers and crops to the requested output size", () => {
    expect(buildExactSizeVideoFilter(1920, 1080)).toBe(
      "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080"
    );
  });
});

describe("resolveOutputFrameSize", () => {
  it("returns the project output size when both sides are valid", () => {
    expect(
      resolveOutputFrameSize({ videoWidth: 1920, videoHeight: 1080 })
    ).toEqual({ width: 1920, height: 1080 });
  });

  it("rejects incomplete or tiny sizes", () => {
    expect(resolveOutputFrameSize({ videoWidth: 1920 })).toBeNull();
    expect(
      resolveOutputFrameSize({ videoWidth: 32, videoHeight: 18 })
    ).toBeNull();
  });
});
