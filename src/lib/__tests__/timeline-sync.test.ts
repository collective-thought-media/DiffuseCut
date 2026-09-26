import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { nanoid, nowMs } from "@/lib/utils";
import { createDefaultSequenceForProject } from "@/lib/services/sequences";
import { buildTimelineFromShots } from "@/lib/services/timeline-sync";

function insertTestProject() {
  const db = getDb();
  const ts = nowMs();
  const projectId = nanoid();
  db.insert(schema.projects)
    .values({
      id: projectId,
      name: "Timeline sync test",
      slug: `tl-sync-${projectId}`,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return projectId;
}

function insertShot(
  projectId: string,
  sequenceId: string,
  sortOrder: number,
  durationFrames: number,
  trimInFrames: number,
  trimOutFrames: number | null
) {
  const db = getDb();
  const ts = nowMs();
  const id = nanoid();
  db.insert(schema.shots)
    .values({
      id,
      projectId,
      sequenceId,
      sortOrder,
      title: `Shot ${sortOrder}`,
      prompt: "",
      durationFrames,
      trimInFrames,
      trimOutFrames,
      videoPath: "renders/clip.mp4",
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return id;
}

describe("buildTimelineFromShots", () => {
  it("lays out V1 clips back-to-back with trim metadata", () => {
    const projectId = insertTestProject();
    const seq = createDefaultSequenceForProject(projectId, 24);
    insertShot(projectId, seq.id, 0, 72, 0, null);
    insertShot(projectId, seq.id, 1, 48, 6, 42);

    const timeline = buildTimelineFromShots(projectId, seq.id, 24);
    const clips = timeline.videoTracks[0]?.clips ?? [];
    expect(clips).toHaveLength(2);
    expect(clips[0]?.startFrame).toBe(0);
    expect(clips[0]?.durationFrames).toBe(72);
    expect(clips[1]?.startFrame).toBe(72);
    expect(clips[1]?.durationFrames).toBe(36);
    expect(clips[1]?.trimInFrames).toBe(6);
    expect(clips[1]?.trimOutFrames).toBe(42);
  });
});
