import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import {
  getProjectSubdirs,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import { scanOrphanedRenders } from "@/lib/services/storage-cleanup";

type RouteParams = { params: Promise<{ id: string }> };

function directorySizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;

  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySizeBytes(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) return jsonError("Project not found", 404);

    const projectRoot = resolveProjectRoot(project);
    const subdirs = getProjectSubdirs(projectRoot);

    const breakdown = {
      characters: directorySizeBytes(subdirs.characters),
      locations: directorySizeBytes(subdirs.locations),
      storyboard: directorySizeBytes(subdirs.storyboard),
      renders: directorySizeBytes(subdirs.renders),
      audio: directorySizeBytes(subdirs.audio),
      exports: directorySizeBytes(subdirs.exports),
      scratch: directorySizeBytes(subdirs.scratch),
    };

    const totalBytes = Object.values(breakdown).reduce(
      (sum, bytes) => sum + bytes,
      0
    );

    const orphanedRenders = scanOrphanedRenders(projectId);
    const orphanedBytes = orphanedRenders.reduce(
      (sum, file) => sum + file.sizeBytes,
      0
    );

    return jsonOk({
      projectId,
      projectRoot,
      totalBytes,
      breakdown,
      orphanedRenders: {
        count: orphanedRenders.length,
        totalBytes: orphanedBytes,
        files: orphanedRenders,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
