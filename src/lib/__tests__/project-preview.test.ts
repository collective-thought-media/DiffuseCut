import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { listProjectPreviewPaths } from "@/lib/project-preview";
import { nanoid, nowMs } from "@/lib/utils";

describe("listProjectPreviewPaths", () => {
  it("collects character, location, and storyboard image paths in order", () => {
    const db = getDb();
    const ts = nowMs();
    const projectId = nanoid();

    db.insert(schema.projects)
      .values({
        id: projectId,
        name: "Preview Test",
        slug: `preview-test-${projectId}`,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const characterId = nanoid();
    db.insert(schema.characters)
      .values({
        id: characterId,
        projectId,
        name: "Hero",
        sortOrder: 0,
        referencePath: "characters/hero/default.png",
        referenceKind: "image",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const locationId = nanoid();
    db.insert(schema.locations)
      .values({
        id: locationId,
        projectId,
        name: "Castle",
        sortOrder: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const locationStateId = nanoid();
    db.insert(schema.locationStates)
      .values({
        id: locationStateId,
        locationId,
        name: "Day",
        sortOrder: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    db.insert(schema.locationAngles)
      .values({
        id: nanoid(),
        locationStateId,
        name: "Wide",
        sortOrder: 0,
        referencePath: "locations/castle/wide.png",
        referenceKind: "image",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    db.insert(schema.shots)
      .values({
        id: nanoid(),
        projectId,
        sortOrder: 0,
        title: "Opening",
        placeholderPath: "storyboard/shots/opening.png",
        placeholderKind: "image",
        durationFrames: 48,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const paths = listProjectPreviewPaths(projectId);

    expect(paths).toEqual([
      "characters/hero/default.png",
      "locations/castle/wide.png",
      "storyboard/shots/opening.png",
    ]);

    db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();
  });

  it("skips video references and deduplicates paths", () => {
    const db = getDb();
    const ts = nowMs();
    const projectId = nanoid();

    db.insert(schema.projects)
      .values({
        id: projectId,
        name: "Dedupe Test",
        slug: `dedupe-test-${projectId}`,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const sharedPath = "storyboard/shots/shared.png";

    db.insert(schema.shots)
      .values([
        {
          id: nanoid(),
          projectId,
          sortOrder: 0,
          title: "A",
          placeholderPath: sharedPath,
          placeholderKind: "image",
          durationFrames: 48,
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: nanoid(),
          projectId,
          sortOrder: 1,
          title: "B",
          placeholderPath: sharedPath,
          placeholderKind: "image",
          durationFrames: 48,
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: nanoid(),
          projectId,
          sortOrder: 2,
          title: "C",
          placeholderPath: "storyboard/shots/clip.mp4",
          placeholderKind: "video",
          durationFrames: 48,
          createdAt: ts,
          updatedAt: ts,
        },
      ])
      .run();

    expect(listProjectPreviewPaths(projectId)).toEqual([sharedPath]);

    db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();
  });
});
