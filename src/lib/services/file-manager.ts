import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  ensureProjectDirs,
  resolveProjectRoot,
  slugify,
  writeProjectMeta,
} from "@/lib/paths/project-paths";
import { getDefaultRenderSettings } from "@/lib/services/settings";

export async function createProject(input: {
  name: string;
  rootPath?: string | null;
}) {
  const db = getDb();
  const id = nanoid();
  const slug = slugify(input.name) + "-" + id.slice(0, 6);
  const ts = Date.now();
  const defaultRenderSettings = await getDefaultRenderSettings();

  const row = {
    id,
    name: input.name,
    slug,
    logline: "",
    plot: "",
    rootPath: input.rootPath ?? null,
    defaultFps: 24,
    defaultDurationFrames: 72,
    comfyuiEndpointsJson: null,
    renderSettingsJson: JSON.stringify(defaultRenderSettings),
    createdAt: ts,
    updatedAt: ts,
  };

  db.insert(schema.projects).values(row).run();

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get()!;

  ensureProjectDirs(project);
  writeProjectMeta(project);
  return project;
}

export type DeleteProjectResult =
  | { ok: false }
  | { ok: true; projectRoot: string; mediaDeleted: boolean };

export async function deleteProject(
  id: string,
  options: { deleteMedia?: boolean } = {}
): Promise<DeleteProjectResult> {
  const deleteMedia = options.deleteMedia !== false;
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();
  if (!project) return { ok: false };

  const root = resolveProjectRoot(project);
  db.delete(schema.projects).where(eq(schema.projects.id, id)).run();

  let mediaDeleted = false;
  if (deleteMedia && fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
    mediaDeleted = true;
  }

  return { ok: true, projectRoot: root, mediaDeleted };
}

export function saveFileToProject(
  projectRoot: string,
  relativeDir: string,
  fileName: string,
  buffer: Buffer
): string {
  const dir = path.join(projectRoot, relativeDir);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, fileName);
  fs.writeFileSync(dest, buffer);
  return path.join(relativeDir, fileName).replace(/\\/g, "/");
}
