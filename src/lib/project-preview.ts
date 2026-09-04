import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const DEFAULT_MAX_PREVIEW_PATHS = 32;

function appendImagePath(
  paths: string[],
  seen: Set<string>,
  pathValue: string | null | undefined,
  kind?: string | null
): boolean {
  if (!pathValue || kind === "video" || seen.has(pathValue)) {
    return false;
  }
  seen.add(pathValue);
  paths.push(pathValue);
  return true;
}

export function listProjectPreviewPaths(
  projectId: string,
  max = DEFAULT_MAX_PREVIEW_PATHS
): string[] {
  const db = getDb();
  const paths: string[] = [];
  const seen = new Set<string>();

  const characters = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.projectId, projectId))
    .orderBy(asc(schema.characters.sortOrder), asc(schema.characters.createdAt))
    .all();

  for (const character of characters) {
    const states = db
      .select()
      .from(schema.characterStates)
      .where(eq(schema.characterStates.characterId, character.id))
      .orderBy(
        asc(schema.characterStates.sortOrder),
        asc(schema.characterStates.createdAt)
      )
      .all();

    let addedForCharacter = false;
    for (const state of states) {
      if (
        appendImagePath(
          paths,
          seen,
          state.referencePath,
          state.referenceKind
        )
      ) {
        addedForCharacter = true;
        if (paths.length >= max) return paths;
      }
    }

    if (
      !addedForCharacter &&
      appendImagePath(
        paths,
        seen,
        character.referencePath,
        character.referenceKind
      ) &&
      paths.length >= max
    ) {
      return paths;
    }
  }

  const locations = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.projectId, projectId))
    .orderBy(asc(schema.locations.sortOrder), asc(schema.locations.createdAt))
    .all();

  for (const location of locations) {
    const states = db
      .select()
      .from(schema.locationStates)
      .where(eq(schema.locationStates.locationId, location.id))
      .orderBy(
        asc(schema.locationStates.sortOrder),
        asc(schema.locationStates.createdAt)
      )
      .all();

    let addedForLocation = false;

    for (const state of states) {
      const angles = db
        .select()
        .from(schema.locationAngles)
        .where(eq(schema.locationAngles.locationStateId, state.id))
        .orderBy(
          asc(schema.locationAngles.sortOrder),
          asc(schema.locationAngles.createdAt)
        )
        .all();

      let addedForState = false;
      for (const angle of angles) {
        if (
          appendImagePath(
            paths,
            seen,
            angle.referencePath,
            angle.referenceKind
          )
        ) {
          addedForLocation = true;
          addedForState = true;
          if (paths.length >= max) return paths;
        }
      }

      if (
        !addedForState &&
        appendImagePath(
          paths,
          seen,
          state.referencePath,
          state.referenceKind
        )
      ) {
        addedForLocation = true;
        if (paths.length >= max) return paths;
      }
    }

    if (
      !addedForLocation &&
      appendImagePath(
        paths,
        seen,
        location.referencePath,
        location.referenceKind
      ) &&
      paths.length >= max
    ) {
      return paths;
    }
  }

  const shots = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.projectId, projectId))
    .orderBy(asc(schema.shots.sortOrder), asc(schema.shots.createdAt))
    .all();

  for (const shot of shots) {
    if (
      appendImagePath(
        paths,
        seen,
        shot.placeholderPath,
        shot.placeholderKind
      ) &&
      paths.length >= max
    ) {
      return paths;
    }
  }

  return paths;
}

export type ProjectListItem = typeof schema.projects.$inferSelect & {
  previewPaths: string[];
};

export function enrichProjectsWithPreviews(
  projects: (typeof schema.projects.$inferSelect)[]
): ProjectListItem[] {
  return projects.map((project) => ({
    ...project,
    previewPaths: listProjectPreviewPaths(project.id),
  }));
}
