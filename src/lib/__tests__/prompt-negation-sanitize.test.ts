import { describe, expect, it } from "vitest";
import {
  splitPositiveNegationPhrases,
  mergeUniqueNegativeTerms,
} from "@/lib/services/prompt-negation-sanitize";

describe("splitPositiveNegationPhrases", () => {
  it("moves no-redhead style phrases into negative terms", () => {
    const result = splitPositiveNegationPhrases(
      "full anthropomorphic blue dragon, no human face, no redhead, no human body, no dress"
    );
    expect(result.cleaned.toLowerCase()).toContain("blue dragon");
    expect(result.cleaned.toLowerCase()).not.toContain("no redhead");
    expect(result.cleaned.toLowerCase()).not.toContain("no human face");
    expect(result.negativeTerms.map((t) => t.toLowerCase())).toEqual(
      expect.arrayContaining([
        "human face",
        "redhead",
        "human body",
        "dress",
      ])
    );
  });

  it("merges unique negative terms", () => {
    expect(
      mergeUniqueNegativeTerms("blurry, redhead", ["redhead", "human face"])
    ).toBe("blurry, redhead, human face");
  });
});
