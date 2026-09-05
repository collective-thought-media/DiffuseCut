import { describe, expect, it } from "vitest";
import type { AudioTrack, Shot } from "@/lib/db/schema";
import { resolveSfxGenerationPrompt } from "@/lib/services/resolve-sfx-generation-prompt";
import {
  buildSfxPromptFromShot,
  buildWooshPromptFromShot,
} from "@/lib/services/shot-sfx-suggest";

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: "shot-4",
    projectId: "proj-1",
    sortOrder: 3,
    title: "Shot 4: The Ascent Begins",
    prompt:
      "Heavy rain pours down at a harsh angle. A sudden sharp flash of bright lightning illuminates the pitch-black background. Azrael climbs crumbling stone stairs.",
    renderOverridesJson: null,
    durationFrames: 72,
    fps: null,
    locationId: null,
    locationStateId: null,
    locationAngleId: null,
    visualReferenceFocus: "location",
    placeholderKind: null,
    placeholderPath: null,
    videoPath: null,
    trimInFrames: 0,
    trimOutFrames: null,
    renderStatus: "pending",
    renderJobId: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
  return {
    id: "track-1",
    projectId: "proj-1",
    kind: "sfx",
    label: "SFX: Shot 4",
    filePath: "audio/tracks/pending",
    startFrame: 0,
    durationFrames: 72,
    spanMode: "single_shot",
    targetShotId: "shot-4",
    promptText: "rain ambience, water droplets. No music.",
    volume: 0.85,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("resolve-sfx-generation-prompt", () => {
  it("derives lightning cues from the linked shot, not stale track text", () => {
    const shot = makeShot();
    const resolved = resolveSfxGenerationPrompt({
      track: makeTrack(),
      shots: [shot],
    });

    expect(resolved.fromShot).toBe(true);
    expect(resolved.strikeModelPrompt).toMatch(/lightning crack|electric zap/i);
    expect(resolved.bedModelPrompt).toMatch(/rain|wind/i);
    expect(resolved.brief).toMatch(/lightning bolt strike/i);
    expect(resolved.brief).toContain("On screen:");
    expect(resolved.modelPrompt).toMatch(/lightning bolt strike/i);
    expect(resolved.modelPrompt).not.toBe("rain ambience, water droplets. No music.");
  });
});

describe("buildSfxPromptFromShot", () => {
  it("includes ranked cues and on-screen context for Woosh", () => {
    const brief = buildSfxPromptFromShot(makeShot(), 3);
    const model = buildWooshPromptFromShot(makeShot(), 3);

    expect(brief).toContain("Cues:");
    expect(brief).toMatch(/lightning bolt strike/i);
    expect(brief).toContain("Heavy rain pours down");
    expect(model).toMatch(/lightning bolt strike/i);
    expect(model).toContain("heavy rain");
  });
});
