import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import {
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";
import { getModels, listEndpoints } from "@/lib/services/comfyui-client";

const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveProjectBaseUrl(projectId: string): Promise<string> {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const appEndpoints = await getDefaultComfyuiEndpoints();
  const endpoints = resolveComfyuiEndpoints(
    project.comfyuiEndpointsJson,
    appEndpoints
  );
  const baseUrl = await listEndpoints(endpoints);

  if (!baseUrl) {
    throw new Error("No reachable ComfyUI endpoint for project");
  }

  return baseUrl;
}

function readCachedModels(
  baseUrl: string,
  folder: string
): string[] | null {
  const db = getDb();
  const row = db
    .select()
    .from(schema.comfyuiModelCache)
    .where(
      and(
        eq(schema.comfyuiModelCache.baseUrl, baseUrl),
        eq(schema.comfyuiModelCache.folder, folder)
      )
    )
    .get();

  if (!row) return null;
  if (Date.now() - row.fetchedAt > CACHE_TTL_MS) return null;

  try {
    const parsed = JSON.parse(row.filenamesJson);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return null;
  }
}

function writeCachedModels(
  baseUrl: string,
  folder: string,
  filenames: string[]
): void {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.comfyuiModelCache)
    .where(
      and(
        eq(schema.comfyuiModelCache.baseUrl, baseUrl),
        eq(schema.comfyuiModelCache.folder, folder)
      )
    )
    .get();

  const payload = {
    baseUrl,
    folder,
    filenamesJson: JSON.stringify(filenames),
    fetchedAt: Date.now(),
  };

  if (existing) {
    db.update(schema.comfyuiModelCache)
      .set(payload)
      .where(eq(schema.comfyuiModelCache.id, existing.id))
      .run();
    return;
  }

  db.insert(schema.comfyuiModelCache)
    .values({ id: nanoid(), ...payload })
    .run();
}

export async function getModelsForFolder(
  projectId: string,
  folder: string
): Promise<string[]> {
  const baseUrl = await resolveProjectBaseUrl(projectId);
  const cached = readCachedModels(baseUrl, folder);
  if (cached) return cached;

  const filenames = await getModels(baseUrl, folder);
  writeCachedModels(baseUrl, folder, filenames);
  return filenames;
}

export async function invalidateModelCache(
  projectId: string,
  folder?: string
): Promise<void> {
  const baseUrl = await resolveProjectBaseUrl(projectId);
  const db = getDb();

  if (folder) {
    db.delete(schema.comfyuiModelCache)
      .where(
        and(
          eq(schema.comfyuiModelCache.baseUrl, baseUrl),
          eq(schema.comfyuiModelCache.folder, folder)
        )
      )
      .run();
    return;
  }

  db.delete(schema.comfyuiModelCache)
    .where(eq(schema.comfyuiModelCache.baseUrl, baseUrl))
    .run();
}
