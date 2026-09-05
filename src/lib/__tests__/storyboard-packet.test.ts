import { describe, expect, it } from "vitest";
import {
  buildShotNotes,
  buildStoryboardReadme,
  shotPacketFolderName,
  storyboardZipFileName,
} from "@/lib/services/storyboard-packet";

describe("shotPacketFolderName", () => {
  it("prefixes a slug with a two-digit index", () => {
    expect(shotPacketFolderName(0, "Park path, Lisa")).toBe(
      "01-park-path-lisa"
    );
    expect(shotPacketFolderName(3, "")).toBe("04-shot");
  });
});

describe("storyboardZipFileName", () => {
  it("names a full board zip from the project", () => {
    expect(storyboardZipFileName("Character Test")).toBe(
      "character-test-storyboard.zip"
    );
  });

  it("names a single-shot zip from the project and shot title", () => {
    expect(storyboardZipFileName("Character Test", "Park path")).toBe(
      "character-test-park-path-storyboard.zip"
    );
  });
});

describe("buildShotNotes", () => {
  it("writes title, duration, cast, and prompt", () => {
    const notes = buildShotNotes({
      title: "Park path, Lisa",
      prompt: "Lisa jogs on the path.",
      durationFrames: 72,
      fps: 24,
      locationName: "Park",
      characterNames: ["Lisa"],
      stillFileName: "still.png",
    });
    expect(notes).toContain("Title: Park path, Lisa");
    expect(notes).toContain("Duration: 72 frames (3.00s at 24 fps)");
    expect(notes).toContain("Location: Park");
    expect(notes).toContain("Characters: Lisa");
    expect(notes).toContain("Still: still.png");
    expect(notes).toContain("Lisa jogs on the path.");
  });
});

describe("buildStoryboardReadme", () => {
  it("explains the packet without private setup details", () => {
    const readme = buildStoryboardReadme();
    expect(readme).toContain("Install clip");
    expect(readme).not.toMatch(/G:\\|192\.168/);
  });
});
