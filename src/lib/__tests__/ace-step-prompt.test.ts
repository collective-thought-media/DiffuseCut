import { describe, expect, it } from "vitest";
import {
  buildAceStepMusicPrompt,
  extractAceStepStructureLyrics,
  inferAceStepBpm,
} from "@/lib/services/ace-step-prompt";

describe("ace-step-prompt", () => {
  it("passes the user brief through as tags with minimal wrapping", () => {
    const brief =
      "Dark orchestral rise, slow burn, tense strings, no vocals, demonic hellish soundscape";

    const result = buildAceStepMusicPrompt(brief, 90);

    expect(result.tags).toContain("Dark orchestral rise");
    expect(result.tags).toContain("90 bpm");
    expect(result.tags).toContain("90 second continuous cinematic score");
    expect(result.lyrics).toBe("");
    expect(result.keyscale).toBe("A minor");
  });

  it("respects explicit bpm in the brief", () => {
    expect(inferAceStepBpm("Epic trailer, 96 bpm, brass hits")).toBe(96);
  });

  it("extracts structure lyrics only when the user includes section markers", () => {
    const brief = `[intro]

Dark orchestral score

[build-up]

[bridge]

[outro]`;

    const lyrics = extractAceStepStructureLyrics(brief);
    expect(lyrics).toContain("[intro]");
    expect(lyrics).toContain("[build-up]");
    expect(lyrics).toContain("Dark orchestral score");
  });
});
