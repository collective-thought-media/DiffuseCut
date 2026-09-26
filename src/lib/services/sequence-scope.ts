import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export function listSequencesForProject(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.sequences)
    .where(eq(schema.sequences.projectId, projectId))
    .orderBy(asc(schema.sequences.sortOrder), asc(schema.sequences.createdAt))
    .all();
}

export function getDefaultSequenceId(projectId: string): string | null {
  const rows = listSequencesForProject(projectId);
  return rows[0]?.id ?? null;
}

export function resolveSequenceId(
  projectId: string,
  sequenceIdParam: string | null | undefined
): string {
  if (sequenceIdParam?.trim()) {
    const row = getDb()
      .select({ id: schema.sequences.id })
      .from(schema.sequences)
      .where(
        eq(schema.sequences.id, sequenceIdParam.trim())
      )
      .get();
    if (row && sequenceBelongsToProject(projectId, row.id)) {
      return row.id;
    }
  }
  const defaultId = getDefaultSequenceId(projectId);
  if (!defaultId) {
    throw new Error("No sequence found for project");
  }
  return defaultId;
}

export function sequenceBelongsToProject(
  projectId: string,
  sequenceId: string
): boolean {
  const row = getDb()
    .select({ projectId: schema.sequences.projectId })
    .from(schema.sequences)
    .where(eq(schema.sequences.id, sequenceId))
    .get();
  return row?.projectId === projectId;
}
