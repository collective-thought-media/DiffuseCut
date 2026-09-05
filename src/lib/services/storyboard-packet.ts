import fs from "fs";
import path from "path";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  resolveMediaPath,
  resolveProjectRoot,
  slugify,
} from "@/lib/paths/project-paths";
import { getShotCharacterCast } from "@/lib/services/shot-cast";

export interface StoryboardPacketEntry {
  path: string;
  data: Buffer;
}

export interface ShotNotesInput {
  title: string;
  prompt: string;
  durationFrames: number;
  fps: number;
  locationName: string | null;
  characterNames: string[];
  stillFileName: string | null;
}

export function shotPacketFolderName(index: number, title: string): string {
  const n = String(index + 1).padStart(2, "0");
  return `${n}-${slugify(title || "shot")}`;
}

export function storyboardZipFileName(
  projectName: string,
  singleShotTitle?: string | null
): string {
  const projectSlug = slugify(projectName || "project");
  if (singleShotTitle) {
    return `${projectSlug}-${slugify(singleShotTitle)}-storyboard.zip`;
  }
  return `${projectSlug}-storyboard.zip`;
}

export function buildStoryboardReadme(): string {
  return [
    "DiffuseCut storyboard packet",
    "",
    "Each numbered folder is one shot. Use the still and the shot notes to generate that clip in another video tool.",
    "Then install the finished clip back onto the same shot in DiffuseCut (Storyboard or Finishing, Install clip).",
    "",
    "storyboard.json is the same shot list in a machine-readable form.",
    "",
  ].join("\n");
}

export function buildShotNotes(input: ShotNotesInput): string {
  const seconds = (input.durationFrames / input.fps).toFixed(2);
  const characters =
    input.characterNames.length > 0
      ? input.characterNames.join(", ")
      : "(none)";
  return [
    `Title: ${input.title || "Untitled shot"}`,
    `Duration: ${input.durationFrames} frames (${seconds}s at ${input.fps} fps)`,
    `Location: ${input.locationName || "(none)"}`,
    `Characters: ${characters}`,
    `Still: ${input.stillFileName || "(none)"}`,
    "",
    "Prompt:",
    input.prompt.trim() || "(none)",
    "",
  ].join("\n");
}

export function collectStoryboardPacket(
  projectId: string,
  shotId?: string | null
): { fileName: string; entries: StoryboardPacketEntry[] } {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const allShots = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.projectId, projectId))
    .orderBy(asc(schema.shots.sortOrder), asc(schema.shots.createdAt))
    .all();

  const shots = shotId
    ? allShots.filter((shot) => shot.id === shotId)
    : allShots;
  if (shotId && shots.length === 0) {
    throw new Error("Shot not found");
  }

  const projectRoot = resolveProjectRoot(project);
  const fps = project.defaultFps || 24;
  const entries: StoryboardPacketEntry[] = [];
  const manifestShots: Array<Record<string, unknown>> = [];

  shots.forEach((shot, i) => {
    const index = shotId
      ? allShots.findIndex((item) => item.id === shot.id)
      : i;
    const folder = shotPacketFolderName(Math.max(0, index), shot.title);
    const location = shot.locationId
      ? db
          .select()
          .from(schema.locations)
          .where(eq(schema.locations.id, shot.locationId))
          .get()
      : null;

    const characterNames = getShotCharacterCast(shot.id)
      .map((entry) => {
        const character = db
          .select()
          .from(schema.characters)
          .where(eq(schema.characters.id, entry.characterId))
          .get();
        return character?.name ?? null;
      })
      .filter((name): name is string => Boolean(name));

    let stillFileName: string | null = null;
    if (shot.placeholderPath && shot.placeholderKind === "image") {
      const abs = resolveMediaPath(projectRoot, shot.placeholderPath);
      if (fs.existsSync(abs)) {
        stillFileName = `still${path.extname(shot.placeholderPath).toLowerCase() || ".png"}`;
        entries.push({
          path: `${folder}/${stillFileName}`,
          data: fs.readFileSync(abs),
        });
      }
    }

    const notes = buildShotNotes({
      title: shot.title,
      prompt: shot.prompt,
      durationFrames: shot.durationFrames,
      fps: shot.fps ?? fps,
      locationName: location?.name ?? null,
      characterNames,
      stillFileName,
    });
    entries.push({
      path: `${folder}/shot.txt`,
      data: Buffer.from(notes, "utf8"),
    });

    manifestShots.push({
      index: Math.max(0, index) + 1,
      id: shot.id,
      title: shot.title,
      prompt: shot.prompt,
      durationFrames: shot.durationFrames,
      fps: shot.fps ?? fps,
      folder,
      still: stillFileName,
      location: location?.name ?? null,
      characters: characterNames,
    });
  });

  const manifest = {
    project: {
      name: project.name,
      fps,
    },
    shots: manifestShots,
  };

  entries.unshift({
    path: "README.txt",
    data: Buffer.from(buildStoryboardReadme(), "utf8"),
  });
  entries.push({
    path: "storyboard.json",
    data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
  });

  return {
    fileName: storyboardZipFileName(
      project.name,
      shotId ? shots[0]?.title : null
    ),
    entries,
  };
}
