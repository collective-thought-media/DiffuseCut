import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getShotCharacterCast } from "@/lib/services/shot-cast";
import { resolveSequenceId } from "@/lib/services/sequence-scope";

export function getShotsWithCast(
  projectId: string,
  sequenceId?: string | null
) {
  const db = getDb();
  const resolvedSequenceId = resolveSequenceId(projectId, sequenceId);
  const shots = db
    .select()
    .from(schema.shots)
    .where(
      and(
        eq(schema.shots.projectId, projectId),
        eq(schema.shots.sequenceId, resolvedSequenceId)
      )
    )
    .orderBy(asc(schema.shots.sortOrder), asc(schema.shots.createdAt))
    .all();

  return shots.map((shot) => {
    const characterCast = getShotCharacterCast(shot.id);
    return {
      ...shot,
      characterCast,
      characterIds: characterCast.map((entry) => entry.characterId),
    };
  });
}
