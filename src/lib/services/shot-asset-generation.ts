import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import {
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
} from "@/lib/db/seed-builtin-templates";
import type {
  AssetGenerationBatch,
  AssetGenerationOption,
  Shot,
} from "@/lib/db/schema";
import {
  resolveMediaPath,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import { assertDependency } from "@/lib/services/dependency-checker";
import {
  getShotCharacterCast,
  resolveCharacterStateForCast,
} from "@/lib/services/character-states";
import { buildShotPlaceholderDescription, buildShotPlaceholderContext } from "@/lib/services/shot-prompt";
import { buildShotPlaceholderPrompts } from "@/lib/services/prompt-preprocess";
import {
  buildShotWardrobeLock,
  shotReferenceFocus,
} from "@/lib/services/shot-placeholder-options";
import { parseVisualStyle } from "@/lib/services/visual-style";
import { ensureProjectRenderCheckpoint } from "@/lib/services/generation-stack";
import { isIpAdapterAvailable } from "@/lib/services/comfyui-client";
import {
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";
import { listEndpoints } from "@/lib/services/comfyui-client";
import {
  resolveCharacterSheetTemplateId,
} from "@/lib/services/asset-generation-queue";
import type { RenderSettings } from "@/types";
import {
  getActiveBatchForEntity,
  getDisplayBatchForEntity,
  getBatchWithOptions,
  updateAssetBatch,
  updateAssetOption,
  archiveAssetBatch,
  listRetainedBatchesForEntity,
} from "@/lib/services/asset-generation-queue";

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

import {
  resolveShotReferencePath,
  resolveShotReferencePathForBatch,
  resolveShotReferencePaths,
} from "@/lib/services/shot-reference";

export async function resolveShotPlaceholderTemplateId(
  projectId: string,
  options?: {
    referencePath?: string | null;
    characterReferencePath?: string | null;
    locationReferencePath?: string | null;
    endpointUrl?: string;
  }
): Promise<string> {
  if (options?.endpointUrl && (await isIpAdapterAvailable(options.endpointUrl))) {
    if (
      options.characterReferencePath &&
      options.locationReferencePath
    ) {
      return BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID;
    }
    const primary =
      options.referencePath ??
      options.characterReferencePath ??
      options.locationReferencePath;
    if (primary) {
      return BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID;
    }
  }

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const renderSettings = JSON.parse(
    project.renderSettingsJson || "{}"
  ) as RenderSettings;
  if (renderSettings.characterSheetTemplateId) {
    return renderSettings.characterSheetTemplateId;
  }
  return resolveCharacterSheetTemplateId(projectId);
}

export function getActiveBatchForShot(shotId: string): AssetGenerationBatch | null {
  return getActiveBatchForEntity("shot", shotId);
}

export function getDisplayBatchForShot(shotId: string): AssetGenerationBatch | null {
  return getDisplayBatchForEntity("shot", shotId);
}

export type ShotPlaceholderPack = {
  batch: AssetGenerationBatch;
  options: AssetGenerationOption[];
  packNumber: number;
  isLatest: boolean;
};

export function listShotPlaceholderPacks(shotId: string): ShotPlaceholderPack[] {
  const retained = listRetainedBatchesForEntity("shot", shotId);
  const active = getDisplayBatchForShot(shotId);
  const activeId = active?.id;

  const merged = [...retained];
  if (active && !merged.some((batch) => batch.id === active.id)) {
    merged.push(active);
  }
  merged.sort((a, b) => a.createdAt - b.createdAt);

  return merged.flatMap((batch, index) => {
    const data = getBatchWithOptions(batch.id);
    if (!data) return [];
    return [
      {
        batch: data.batch,
        options: data.options,
        packNumber: index + 1,
        isLatest: batch.id === merged[merged.length - 1]?.id,
      },
    ];
  });
}

export function getShotPlaceholderBatchView(
  shotId: string,
  batchId?: string | null
): {
  batch: AssetGenerationBatch | null;
  options: AssetGenerationOption[];
  packs: ShotPlaceholderPack[];
  activeBatchId: string | null;
} {
  const packs = listShotPlaceholderPacks(shotId);
  const active = getDisplayBatchForShot(shotId);

  if (packs.length === 0) {
    return {
      batch: null,
      options: [],
      packs: [],
      activeBatchId: active?.id ?? null,
    };
  }

  const viewed =
    (batchId ? packs.find((pack) => pack.batch.id === batchId) : null) ??
    (active ? packs.find((pack) => pack.batch.id === active.id) : null) ??
    packs[packs.length - 1];

  return {
    batch: viewed.batch,
    options: viewed.options,
    packs,
    activeBatchId: active?.id ?? null,
  };
}

export function archiveShotPlaceholderBatch(batch: AssetGenerationBatch): void {
  if (batch.status === "archived") return;
  archiveAssetBatch(batch.id);
}

function supersedeShotPlaceholderBatch(
  projectId: string,
  shotId: string,
  priorBatch: AssetGenerationBatch
): void {
  if (
    priorBatch.status === "awaiting_selection" ||
    priorBatch.status === "failed" ||
    priorBatch.status === "archived"
  ) {
    archiveShotPlaceholderBatch(priorBatch);
    return;
  }
  discardShotPlaceholderBatch(projectId, shotId, priorBatch);
}

export function discardShotPlaceholderBatch(
  projectId: string,
  shotId: string,
  batchOverride?: AssetGenerationBatch | string
): void {
  const db = getDb();
  let batch: AssetGenerationBatch | undefined;
  if (typeof batchOverride === "string") {
    batch =
      db
        .select()
        .from(schema.assetGenerationBatches)
        .where(eq(schema.assetGenerationBatches.id, batchOverride))
        .get() ?? undefined;
  } else {
    batch = batchOverride ?? getDisplayBatchForShot(shotId) ?? undefined;
  }

  if (!batch) {
    throw new Error("No shot placeholder batch to discard");
  }
  if (batch.projectId !== projectId) {
    throw new Error("Batch does not belong to this project");
  }
  if (batch.entityType !== "shot" || batch.entityId !== shotId) {
    throw new Error("Batch does not belong to this shot");
  }

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  const projectRoot = resolveProjectRoot(project);
  const data = getBatchWithOptions(batch.id);

  if (data) {
    for (const option of data.options) {
      if (!option.outputPath) continue;
      try {
        const abs = resolveMediaPath(projectRoot, option.outputPath);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {
        /* ignore */
      }
    }
  }

  const candidateDir = path.join(
    projectRoot,
    "storyboard",
    "shots",
    shotId,
    "candidates",
    batch.id
  );
  if (fs.existsSync(candidateDir)) {
    fs.rmSync(candidateDir, { recursive: true, force: true });
  }

  const ts = Date.now();
  db.update(schema.assetGenerationOptions)
    .set({ status: "cancelled", completedAt: ts })
    .where(eq(schema.assetGenerationOptions.batchId, batch.id))
    .run();

  updateAssetBatch(batch.id, {
    status: "cancelled",
    completedAt: ts,
  });
}

export async function enqueueShotPlaceholderBatch(
  projectId: string,
  shotId: string,
  sampleCount: number,
  options?: { replace?: boolean }
): Promise<AssetGenerationBatch> {
  await assertDependency("comfyui");

  const count = Math.min(4, Math.max(2, sampleCount));
  const db = getDb();

  const shot = db
    .select()
    .from(schema.shots)
    .where(
      and(
        eq(schema.shots.id, shotId),
        eq(schema.shots.projectId, projectId)
      )
    )
    .get();
  if (!shot) throw new Error("Shot not found");

  const placeholderDescription = buildShotPlaceholderDescription(shotId);
  const shotPrompt = shot.prompt.trim() || placeholderDescription;
  const shotContext = buildShotPlaceholderContext(shotId);
  if (!placeholderDescription.trim()) {
    throw new Error(
      "Add a shot prompt, location, or character cast before generating"
    );
  }

  const priorBatch = getActiveBatchForShot(shotId);
  if (priorBatch && !options?.replace) {
    throw new Error(
      "A shot image batch is already in progress. Discard it first or regenerate."
    );
  }

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get()!;

  const appEndpoints = await getDefaultComfyuiEndpoints();
  const endpoints = resolveComfyuiEndpoints(
    project.comfyuiEndpointsJson,
    appEndpoints
  );
  const endpointUrl = await listEndpoints(endpoints);
  if (!endpointUrl) {
    throw new Error("No reachable ComfyUI endpoint configured");
  }

  const referencePaths = resolveShotReferencePaths(shot);
  const templateId = await resolveShotPlaceholderTemplateId(projectId, {
    referencePath: referencePaths.primaryPath,
    characterReferencePath: referencePaths.characterPath,
    locationReferencePath: referencePaths.locationPath,
    endpointUrl,
  });

  const template = db
    .select()
    .from(schema.workflowTemplates)
    .where(eq(schema.workflowTemplates.id, templateId))
    .get();

  if (
    !template ||
    (template.purpose !== "character_sheet" &&
      template.purpose !== "location_sheet")
  ) {
    throw new Error("Invalid shot placeholder workflow template");
  }

  await ensureProjectRenderCheckpoint(projectId, endpointUrl);

  const visualStyle = parseVisualStyle(project.visualStyleJson);
  const shotLabel = shot.title.trim() || "Storyboard shot";
  const cast = getShotCharacterCast(shotId).flatMap((row) => {
    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, row.characterId))
      .get();
    if (!character) return [];
    const state = resolveCharacterStateForCast(
      row.characterId,
      row.characterStateId
    );
    if (!state) return [];
    return [{ character, state }];
  });
  const referenceFocus = shotReferenceFocus(shot);
  const wardrobeLock = buildShotWardrobeLock(cast, referenceFocus);
  const { processedPrompt, negativePrompt } = await buildShotPlaceholderPrompts(
    shotLabel,
    shotPrompt,
    visualStyle,
    {
      context: shotContext || undefined,
      referenceFocus,
      wardrobeLock,
    }
  );

  const ts = Date.now();
  const batchId = nanoid();
  const batch: typeof schema.assetGenerationBatches.$inferInsert = {
    id: batchId,
    projectId,
    entityType: "shot",
    entityId: shotId,
    workflowTemplateId: templateId,
    comfyuiEndpointUrl: endpointUrl,
    status: "queued",
    sampleCount: count,
    rawPrompt: placeholderDescription,
    processedPrompt,
    negativePrompt,
    createdAt: ts,
  };

  db.insert(schema.assetGenerationBatches).values(batch).run();

  const candidateDir = path.join(
    resolveProjectRoot(project),
    "storyboard",
    "shots",
    shotId,
    "candidates",
    batchId
  );
  fs.mkdirSync(candidateDir, { recursive: true });

  for (let i = 0; i < count; i++) {
    db.insert(schema.assetGenerationOptions)
      .values({
        id: nanoid(),
        batchId,
        variantIndex: i,
        seed: randomSeed(),
        status: "queued",
        createdAt: ts,
      })
      .run();
  }

  if (priorBatch) {
    supersedeShotPlaceholderBatch(projectId, shotId, priorBatch);
  }

  return db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, batchId))
    .get()!;
}

export async function selectShotPlaceholderOption(
  projectId: string,
  shotId: string,
  optionId: string
): Promise<Shot> {
  const db = getDb();
  const option = db
    .select()
    .from(schema.assetGenerationOptions)
    .where(eq(schema.assetGenerationOptions.id, optionId))
    .get();

  if (!option || option.status !== "completed" || !option.outputPath) {
    throw new Error("Option not ready for selection");
  }

  const batch = db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, option.batchId))
    .get();

  if (
    !batch ||
    batch.projectId !== projectId ||
    batch.entityType !== "shot" ||
    batch.entityId !== shotId
  ) {
    throw new Error("Option does not belong to this shot");
  }

  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotId))
    .get();
  if (!shot) throw new Error("Shot not found");

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get()!;
  const projectRoot = resolveProjectRoot(project);
  const sourceAbs = resolveMediaPath(projectRoot, option.outputPath);
  if (!fs.existsSync(sourceAbs)) {
    throw new Error("Generated file missing on disk");
  }

  const ext = path.extname(sourceAbs) || ".png";
  const destRelative = `storyboard/shots/${shotId}/placeholder${ext}`;
  const destAbs = path.join(projectRoot, destRelative);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(sourceAbs, destAbs);

  const ts = Date.now();
  db.update(schema.shots)
    .set({
      placeholderPath: destRelative.replace(/\\/g, "/"),
      placeholderKind: "image",
      updatedAt: ts,
    })
    .where(eq(schema.shots.id, shotId))
    .run();

  const updated = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotId))
    .get()!;

  const siblingOptions = db
    .select()
    .from(schema.assetGenerationOptions)
    .where(eq(schema.assetGenerationOptions.batchId, batch.id))
    .all();

  for (const sibling of siblingOptions) {
    updateAssetOption(sibling.id, {
      selected: sibling.id === optionId,
    });
  }

  updateAssetBatch(batch.id, {
    status: "awaiting_selection",
    completedAt: null,
    errorMessage: null,
  });

  return updated;
}

export function getShotCandidateOutputPath(
  shotId: string,
  batchId: string,
  optionId: string
): string {
  return `storyboard/shots/${shotId}/candidates/${batchId}/${optionId}.png`;
}
