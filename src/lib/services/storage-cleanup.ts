import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  getProjectSubdirs,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";

const RENDER_MEDIA_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);

function listRenderFiles(rendersDir: string): string[] {
  if (!fs.existsSync(rendersDir)) return [];

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (RENDER_MEDIA_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  };

  walk(rendersDir);
  return files;
}

function collectReferencedRenderPaths(projectId: string, projectRoot: string): Set<string> {
  const db = getDb();
  const shots = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.projectId, projectId))
    .all();

  const referenced = new Set<string>();

  for (const shot of shots) {
    for (const relative of [shot.videoPath, shot.placeholderPath]) {
      if (!relative) continue;
      referenced.add(path.resolve(projectRoot, relative));
    }
  }

  const jobs = db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.projectId, projectId))
    .all();

  for (const job of jobs) {
    if (!job.outputPath) continue;
    referenced.add(path.resolve(projectRoot, job.outputPath));
    if (job.previewImagePath) {
      referenced.add(path.resolve(projectRoot, job.previewImagePath));
    }
  }

  return referenced;
}

export interface OrphanedRenderFile {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
}

export function scanOrphanedRenders(projectId: string): OrphanedRenderFile[] {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const projectRoot = resolveProjectRoot(project);
  const { renders: rendersDir } = getProjectSubdirs(projectRoot);
  const referenced = collectReferencedRenderPaths(projectId, projectRoot);
  const orphans: OrphanedRenderFile[] = [];

  for (const absolutePath of listRenderFiles(rendersDir)) {
    if (referenced.has(absolutePath)) continue;
    const stat = fs.statSync(absolutePath);
    orphans.push({
      absolutePath,
      relativePath: path
        .relative(projectRoot, absolutePath)
        .replace(/\\/g, "/"),
      sizeBytes: stat.size,
    });
  }

  return orphans;
}

export function purgeOrphanedRenders(projectId: string): OrphanedRenderFile[] {
  const orphans = scanOrphanedRenders(projectId);

  for (const orphan of orphans) {
    if (fs.existsSync(orphan.absolutePath)) {
      fs.unlinkSync(orphan.absolutePath);
    }
  }

  return orphans;
}
