import fs from "fs";
import path from "path";
import { getProjectsDir, ensureDir } from "./app-paths";
import type { Project } from "@/lib/db/schema";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "project";
}

export function resolveProjectRoot(project: Project): string {
  if (project.rootPath) return project.rootPath;
  return path.join(getProjectsDir(), project.slug);
}

export function getProjectSubdirs(root: string) {
  return {
    root,
    characters: path.join(root, "characters"),
    locations: path.join(root, "locations"),
    storyboard: path.join(root, "storyboard", "shots"),
    renders: path.join(root, "renders"),
    audio: path.join(root, "audio", "tracks"),
    exports: path.join(root, "exports"),
    scratch: path.join(root, ".diffusecut"),
  };
}

export function ensureProjectDirs(project: Project) {
  const root = resolveProjectRoot(project);
  const dirs = getProjectSubdirs(root);
  Object.values(dirs).forEach((d) => ensureDir(d));
  return dirs;
}

export function writeProjectMeta(project: Project) {
  const root = resolveProjectRoot(project);
  ensureDir(root);
  const meta = {
    id: project.id,
    name: project.name,
    slug: project.slug,
    logline: project.logline,
    defaultFps: project.defaultFps,
    updatedAt: project.updatedAt,
  };
  fs.writeFileSync(
    path.join(root, "project.json"),
    JSON.stringify(meta, null, 2)
  );
}

export function writeEntityMeta(
  entityDir: string,
  meta: Record<string, unknown>
) {
  ensureDir(entityDir);
  fs.writeFileSync(path.join(entityDir, "meta.json"), JSON.stringify(meta, null, 2));
}

export function safeRelativePath(projectRoot: string, relative: string): string {
  const resolved = path.resolve(projectRoot, relative);
  const rootResolved = path.resolve(projectRoot);
  if (!resolved.startsWith(rootResolved)) {
    throw new Error("Path traversal denied");
  }
  return relative.replace(/\\/g, "/");
}

export function resolveMediaPath(projectRoot: string, relative: string): string {
  safeRelativePath(projectRoot, relative);
  return path.join(projectRoot, relative);
}
