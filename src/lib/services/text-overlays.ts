import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { nanoid, nowMs } from "@/lib/utils";

export type TextOverlayInput = {
  id?: string;
  text: string;
  startFrame: number;
  endFrame: number;
  shotId?: string | null;
};

export function listTextOverlays(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.textOverlays)
    .where(eq(schema.textOverlays.projectId, projectId))
    .orderBy(asc(schema.textOverlays.sortOrder), asc(schema.textOverlays.createdAt))
    .all();
}

export function saveTextOverlays(
  projectId: string,
  overlays: TextOverlayInput[]
) {
  const db = getDb();
  const ts = nowMs();

  db.delete(schema.textOverlays)
    .where(eq(schema.textOverlays.projectId, projectId))
    .run();

  overlays.forEach((overlay, index) => {
    db.insert(schema.textOverlays)
      .values({
        id: overlay.id?.trim() || nanoid(),
        projectId,
        shotId: overlay.shotId ?? null,
        text: overlay.text.trim(),
        startFrame: overlay.startFrame,
        endFrame: overlay.endFrame,
        styleJson: "{}",
        sortOrder: index,
        createdAt: ts,
      })
      .run();
  });

  return listTextOverlays(projectId);
}
