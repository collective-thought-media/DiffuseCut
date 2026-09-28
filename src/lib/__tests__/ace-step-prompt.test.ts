import { describe, expect, it } from "vitest";
import {
  buildAceStepMusicPrompt,
  extractAceStepStructureLyrics,
  inferAceStepBpm,
  resolveAceStepSourceDuration,
  ACE_STEP_PROVEN_DESERT_SCORE_TAGS,
} from "@/lib/services/ace-step-prompt";

describe("ace-step-prompt", () => {
  it("puts cinematic progression in tags and keeps lyrics empty", () => {
    const brief =
      "Dark orchestral rise, slow burn, tense strings, no vocals, demonic hellish soundscape";

    const result = buildAceStepMusicPrompt(brief, 90);

    expect(result.tags).toContain("Dark orchestral rise");
    expect(result.tags).toContain("72 bpm");
    expect(result.tags).toContain("continuous energy throughout");
    expect(result.tags).toContain("orchestral string ensemble");
    expect(result.tags).toContain("resolve at the end");
    expect(result.lyrics).toBe("");
    expect(result.keyscale).toBe("A minor");
  });

  it("respects explicit bpm in the brief", () => {
    expect(inferAceStepBpm("Epic trailer, 96 bpm, brass hits")).toBe(96);
  });

  it("uses slower default bpm for cinematic briefs", () => {
    expect(
      inferAceStepBpm("Cinematic moody score with rising strings")
    ).toBe(72);
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

  it("keeps short desert cues as tag-driven instrumentals", () => {
    const result = buildAceStepMusicPrompt(
      "Cinematic Moody score that uses rising strings to create tension towards the end of the 14 second portion.",
      14
    );

    expect(result.bpm).toBe(72);
    expect(result.tags.toLowerCase()).toContain("rising tension");
    expect(result.tags.toLowerCase()).toContain("instrumental only");
    expect(result.lyrics).toBe("");
  });

  it("rebuilds sparse no-EDM briefs into Control Gate style tags", () => {
    const brief =
      "Cinematic desert film score, live orchestral string ensemble, sparse low cellos at the start, rising violins building tension toward the end, dark moody suspense, no EDM, no synth lead, no vocals, 72 bpm, A minor";

    const result = buildAceStepMusicPrompt(brief, 17);

    expect(result.tags).toContain("continuous energy throughout");
    expect(result.tags).toContain("hi-fi");
    expect(result.tags).toContain("warm amber atmosphere");
    expect(result.tags).toContain("sand and wind texture soft under strings");
    expect(result.tags.toLowerCase()).not.toContain("sparse");
    expect(result.lyrics).toBe("");
  });

  it("passes through the proven desert Control Gate tags unchanged", () => {
    const result = buildAceStepMusicPrompt(ACE_STEP_PROVEN_DESERT_SCORE_TAGS, 17);
    expect(result.tags).toBe(ACE_STEP_PROVEN_DESERT_SCORE_TAGS);
    expect(result.lyrics).toBe("");
    expect(result.bpm).toBe(72);
  });

  it("generates at least 45s of music when the edit span is shorter", () => {
    expect(resolveAceStepSourceDuration("music", 14)).toBe(45);
    expect(resolveAceStepSourceDuration("music", 17)).toBe(45);
    expect(resolveAceStepSourceDuration("music", 60)).toBe(60);
  });
});
