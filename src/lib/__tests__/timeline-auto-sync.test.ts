import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { nanoid, nowMs } from "@/lib/utils";
import { createDefaultSequenceForProject, getTimelineState } from "@/lib/services/sequences";

function insertTestProject() {
  const db = getDb();
  const ts = nowMs();
  const projectId = nanoid();
  db.insert(schema.projects)
    .values({
      id: projectId,
      name: "Auto sync test",
      slug: `auto-sync-${projectId}`,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return projectId;
}

describe("getTimelineState syncFromStoryboardIfEmpty", () => {
  it("fills V1 when timeline is empty but shots have media", () => {
    const projectId = insertTestProject();
    const seq = createDefaultSequenceForProject(projectId, 24);
    const db = getDb();
    const ts = nowMs();
    db.insert(schema.shots)
      .values({
        id: nanoid(),
        projectId,
        sequenceId: seq.id,
        sortOrder: 0,
        title: "Desert wide",
        prompt: "",
        durationFrames: 48,
        videoPath: "renders/desert.mp4",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const timeline = getTimelineState(projectId, seq.id, {
      syncFromStoryboardIfEmpty: true,
      fps: 24,
    });

    expect(timeline?.videoTracks[0]?.clips.length).toBe(1);
    expect(timeline?.videoTracks[0]?.clips[0]?.sourceType).toBe("shot");
  });
});
