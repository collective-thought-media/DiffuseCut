import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { nanoid, nowMs } from "@/lib/utils";
import {
  createDefaultSequenceForProject,
  createSequence,
  duplicateSequence,
  listShotsForSequence,
  moveShotToSequence,
} from "@/lib/services/sequences";
import { parseTimelineState } from "@/lib/timeline/defaults";

function insertTestProject() {
  const db = getDb();
  const ts = nowMs();
  const projectId = nanoid();
  db.insert(schema.projects)
    .values({
      id: projectId,
      name: "Sequence test",
      slug: `seq-test-${projectId}`,
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
  title: string
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
      title,
      prompt: "",
      durationFrames: 48,
      placeholderPath: "shots/placeholder.png",
      placeholderKind: "image",
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return id;
}

describe("sequences service", () => {
  it("creates a default sequence for a project", () => {
    const projectId = insertTestProject();
    const seq = createDefaultSequenceForProject(projectId, 24, "Storyboard");
    expect(seq.name).toBe("Storyboard");
    expect(seq.projectId).toBe(projectId);
  });

  it("moves a shot between sequences", () => {
    const projectId = insertTestProject();
    const main = createDefaultSequenceForProject(projectId);
    const other = createSequence(projectId, "B roll");
    const shotId = insertShot(projectId, main.id, 0, "Opening");

    moveShotToSequence(projectId, shotId, other.id);

    expect(listShotsForSequence(projectId, main.id)).toHaveLength(0);
    expect(listShotsForSequence(projectId, other.id)).toHaveLength(1);
    expect(listShotsForSequence(projectId, other.id)[0]?.id).toBe(shotId);
  });

  it("duplicates shots and remaps timeline shot refs", () => {
    const projectId = insertTestProject();
    const source = createDefaultSequenceForProject(projectId);
    const shotA = insertShot(projectId, source.id, 0, "A");
    const shotB = insertShot(projectId, source.id, 1, "B");

    const db = getDb();
    const timeline = parseTimelineState(source.timelineJson);
    timeline.videoTracks[0]!.clips = [
      {
        id: nanoid(),
        name: "A",
        sourceType: "shot",
        sourceRef: shotA,
        sourceUrl: "/media/a",
        startFrame: 0,
        durationFrames: 48,
        trimInFrames: 0,
        trimOutFrames: null,
      },
    ];
    db.update(schema.sequences)
      .set({
        timelineJson: JSON.stringify(timeline),
        updatedAt: nowMs(),
      })
      .where(eq(schema.sequences.id, source.id))
      .run();

    const copy = duplicateSequence(projectId, source.id, "Copy");
    const copyShots = listShotsForSequence(projectId, copy.id);
    expect(copyShots).toHaveLength(2);

    const copyTimeline = parseTimelineState(copy.timelineJson);
    const clipRef = copyTimeline.videoTracks[0]?.clips[0]?.sourceRef;
    expect(copyShots.some((s) => s.id === clipRef)).toBe(true);
    expect(clipRef).not.toBe(shotA);
  });
});
