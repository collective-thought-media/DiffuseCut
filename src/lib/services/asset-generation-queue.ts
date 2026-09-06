import fs from "fs";
import path from "path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { HttpError } from "@/lib/api-helpers";
import {
  resolveDefaultCharacterSheetTemplateId,
} from "@/lib/db/seed-builtin-templates";
import type {
  AssetGenerationBatch,
  AssetGenerationOption,
  Character,
} from "@/lib/db/schema";
import {
  resolveMediaPath,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import { assertDependency } from "@/lib/services/dependency-checker";
import { filterSelectableShotOptions } from "@/lib/shot-pipeline-shared";
import {
  buildStateSheetDescription,
  getCharacterState,
  syncCharacterReferenceFromState,
} from "@/lib/services/character-states";
import { buildCharacterSheetPrompts } from "@/lib/services/prompt-preprocess";
import { parseVisualStyle } from "@/lib/services/visual-style";
import { ensureProjectStillImageSettings } from "@/lib/services/generation-stack";
import { mergeImageNegativePrompt } from "@/lib/services/image-generation-overrides";
import {
  getAssetGenerationBatchView,
  listAssetGenerationPacks,
  supersedeAssetGenerationBatch,
  type AssetGenerationPack,
} from "@/lib/services/asset-generation-packs";
import type { RenderSettings } from "@/types";
import {
  getDefaultCharacterSheetTemplateId,
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";
import { listEndpoints } from "@/lib/services/comfyui-client";

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export async function resolveCharacterSheetTemplateId(
  projectId: string
): Promise<string> {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) {
    throw new Error("Project not found");
  }

  const renderSettings = JSON.parse(
    project.renderSettingsJson || "{}"
  ) as RenderSettings;
  if (renderSettings.characterSheetTemplateId) {
    return renderSettings.characterSheetTemplateId;
  }
  const configured = await getDefaultCharacterSheetTemplateId();
  return resolveDefaultCharacterSheetTemplateId(configured);
}

export async function enqueueCharacterSheetBatch(
  projectId: string,
  characterId: string,
  stateId: string,
  sampleCount: number,
  options?: {
    replace?: boolean;
    descriptionOverride?: string;
    extraNegativePrompt?: string;
  }
): Promise<AssetGenerationBatch> {
  await assertDependency("comfyui");

  const count = Math.min(4, Math.max(2, sampleCount));
  const db = getDb();

  const character = db
    .select()
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.id, characterId),
        eq(schema.characters.projectId, projectId)
      )
    )
    .get();

  if (!character) throw new Error("Character not found");

  const state = getCharacterState(projectId, characterId, stateId);
  if (!state) throw new Error("Character state not found");

  const sheetDescription =
    options?.descriptionOverride?.trim() ||
    buildStateSheetDescription(character, state);
  if (!sheetDescription.trim()) {
    throw new Error("Add a character description or state look description first");
  }

  const priorBatch =
    getActiveBatchForState(characterId, stateId) ??
    (options?.replace
      ? getDisplayBatchForState(characterId, stateId)
      : null);
  if (priorBatch && !options?.replace) {
    throw new HttpError(
      "A character sheet batch is already in progress. Discard it first or regenerate.",
      409
    );
  }

  const templateId = await resolveCharacterSheetTemplateId(projectId);
  if (!templateId) {
    throw new Error("No character sheet workflow available.");
  }

  const template = db
    .select()
    .from(schema.workflowTemplates)
    .where(eq(schema.workflowTemplates.id, templateId))
    .get();

  if (!template || template.purpose !== "character_sheet") {
    throw new Error("Invalid character sheet workflow template");
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

  await ensureProjectStillImageSettings(projectId, endpointUrl, { templateId });

  const visualStyle = parseVisualStyle(project.visualStyleJson);

  const { processedPrompt, negativePrompt } = await buildCharacterSheetPrompts(
    character.name,
    sheetDescription,
    visualStyle
  );
  const renderSettings = JSON.parse(
    project.renderSettingsJson || "{}"
  ) as RenderSettings;
  const finalNegativePrompt = mergeImageNegativePrompt(
    negativePrompt,
    renderSettings.imageDefaultNegative,
    options?.extraNegativePrompt
  );

  const ts = Date.now();
  const batchId = nanoid();
  const batch: typeof schema.assetGenerationBatches.$inferInsert = {
    id: batchId,
    projectId,
    entityType: "character_state",
    entityId: stateId,
    workflowTemplateId: templateId,
    comfyuiEndpointUrl: endpointUrl,
    status: "queued",
    sampleCount: count,
    rawPrompt: sheetDescription,
    processedPrompt,
    negativePrompt: finalNegativePrompt,
    createdAt: ts,
  };

  db.insert(schema.assetGenerationBatches).values(batch).run();

  const candidateDir = path.join(
    resolveProjectRoot(project),
    "characters",
    characterId,
    "states",
    stateId,
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
    supersedeCharacterSheetBatch(
      projectId,
      characterId,
      stateId,
      priorBatch
    );
  }

  return db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, batchId))
    .get()!;
}

export function getActiveBatchForEntity(
  entityType: AssetGenerationBatch["entityType"],
  entityId: string
): AssetGenerationBatch | null {
  const batch = getDisplayBatchForEntity(entityType, entityId);
  if (!batch) return null;
  if (
    batch.status === "queued" ||
    batch.status === "running" ||
    batch.status === "awaiting_selection"
  ) {
    return batch;
  }
  return null;
}

/** Latest batch visible in the UI, including failed runs until replaced or dismissed. */
export function getDisplayBatchForEntity(
  entityType: AssetGenerationBatch["entityType"],
  entityId: string
): AssetGenerationBatch | null {
  const db = getDb();
  const latest = db
    .select()
    .from(schema.assetGenerationBatches)
    .where(
      and(
        eq(schema.assetGenerationBatches.entityType, entityType),
        eq(schema.assetGenerationBatches.entityId, entityId)
      )
    )
    .orderBy(desc(schema.assetGenerationBatches.createdAt))
    .get();

  if (!latest) return null;

  if (
    latest.status === "queued" ||
    latest.status === "running" ||
    latest.status === "awaiting_selection" ||
    latest.status === "failed"
  ) {
    return latest;
  }

  return null;
}

const RETAINED_BATCH_STATUSES = [
  "awaiting_selection",
  "archived",
  "failed",
] as const;

export function archiveAssetBatch(batchId: string): void {
  updateAssetBatch(batchId, {
    status: "archived",
    completedAt: Date.now(),
  });
}

/** Keep all generated options in pack history after the user picks a reference. */
export function archiveBatchAfterReferenceSelection(
  batchId: string,
  selectedOptionId: string
): void {
  const data = getBatchWithOptions(batchId);
  if (!data) return;

  for (const option of data.options) {
    updateAssetOption(option.id, {
      selected: option.id === selectedOptionId,
    });
  }

  if (data.batch.status !== "archived") {
    archiveAssetBatch(batchId);
  }
}

export function listRetainedBatchesForEntity(
  entityType: AssetGenerationBatch["entityType"],
  entityId: string
): AssetGenerationBatch[] {
  const db = getDb();
  return db
    .select()
    .from(schema.assetGenerationBatches)
    .where(
      and(
        eq(schema.assetGenerationBatches.entityType, entityType),
        eq(schema.assetGenerationBatches.entityId, entityId),
        inArray(schema.assetGenerationBatches.status, [...RETAINED_BATCH_STATUSES])
      )
    )
    .orderBy(asc(schema.assetGenerationBatches.createdAt))
    .all();
}

export function getActiveBatchForState(
  characterId: string,
  stateId: string
): AssetGenerationBatch | null {
  const stateBatch = getActiveBatchForEntity("character_state", stateId);
  if (stateBatch) return stateBatch;

  const db = getDb();
  const firstState = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.characterId, characterId))
    .orderBy(
      asc(schema.characterStates.sortOrder),
      asc(schema.characterStates.createdAt)
    )
    .get();

  if (firstState?.id === stateId) {
    return getActiveBatchForEntity("character", characterId);
  }

  return null;
}

export function getDisplayBatchForState(
  characterId: string,
  stateId: string
): AssetGenerationBatch | null {
  const stateBatch = getDisplayBatchForEntity("character_state", stateId);
  if (stateBatch) return stateBatch;

  const db = getDb();
  const firstState = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.characterId, characterId))
    .orderBy(
      asc(schema.characterStates.sortOrder),
      asc(schema.characterStates.createdAt)
    )
    .get();

  if (firstState?.id === stateId) {
    return getDisplayBatchForEntity("character", characterId);
  }

  return null;
}

export function getActiveBatchForCharacter(
  characterId: string
): AssetGenerationBatch | null {
  const db = getDb();
  const stateIds = db
    .select({ id: schema.characterStates.id })
    .from(schema.characterStates)
    .where(eq(schema.characterStates.characterId, characterId))
    .all()
    .map((row) => row.id);

  for (const stateId of stateIds) {
    const batch = getActiveBatchForState(characterId, stateId);
    if (batch) return batch;
  }

  return getActiveBatchForEntity("character", characterId);
}

export type CharacterSheetPack = AssetGenerationPack;

export function listCharacterSheetPacks(
  characterId: string,
  stateId: string
): CharacterSheetPack[] {
  return listAssetGenerationPacks("character_state", stateId, () =>
    getDisplayBatchForState(characterId, stateId)
  );
}

export function getCharacterSheetBatchView(
  characterId: string,
  stateId: string,
  batchId?: string | null
) {
  return getAssetGenerationBatchView(
    "character_state",
    stateId,
    () => getDisplayBatchForState(characterId, stateId),
    batchId
  );
}

export function supersedeCharacterSheetBatch(
  projectId: string,
  characterId: string,
  stateId: string,
  priorBatch: AssetGenerationBatch
): void {
  supersedeAssetGenerationBatch(priorBatch, (batch) =>
    discardCharacterSheetBatch(projectId, characterId, stateId, batch)
  );
}

export function discardCharacterSheetBatch(
  projectId: string,
  characterId: string,
  stateId: string,
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
    batch = batchOverride ?? getDisplayBatchForState(characterId, stateId) ?? undefined;
  }
  if (!batch) {
    throw new Error("No character sheet batch to discard");
  }
  if (batch.projectId !== projectId) {
    throw new Error("Batch does not belong to this project");
  }
  const batchMatchesState =
    batch.entityType === "character_state" && batch.entityId === stateId;
  const batchMatchesLegacy =
    batch.entityType === "character" && batch.entityId === characterId;
  if (!batchMatchesState && !batchMatchesLegacy) {
    throw new Error("Batch does not belong to this character state");
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

  const candidateDirs = [
    path.join(
      projectRoot,
      "characters",
      characterId,
      "states",
      stateId,
      "candidates",
      batch.id
    ),
    path.join(projectRoot, "characters", characterId, "candidates", batch.id),
  ];
  for (const candidateDir of candidateDirs) {
    if (fs.existsSync(candidateDir)) {
      fs.rmSync(candidateDir, { recursive: true, force: true });
    }
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

export function getBatchWithOptions(batchId: string): {
  batch: AssetGenerationBatch;
  options: AssetGenerationOption[];
} | null {
  const db = getDb();
  const batch = db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, batchId))
    .get();
  if (!batch) return null;

  const options = db
    .select()
    .from(schema.assetGenerationOptions)
    .where(eq(schema.assetGenerationOptions.batchId, batchId))
    .all()
    .sort((a, b) => a.variantIndex - b.variantIndex);

  return { batch, options };
}

export function getNextQueuedAssetOption(): AssetGenerationOption | null {
  const db = getDb();
  const options = db
    .select()
    .from(schema.assetGenerationOptions)
    .where(eq(schema.assetGenerationOptions.status, "queued"))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt);

  if (options.length === 0) return null;

  const running = db
    .select()
    .from(schema.assetGenerationOptions)
    .where(eq(schema.assetGenerationOptions.status, "running"))
    .all();

  if (running.length > 0) return null;

  for (const option of options) {
    if (option.dependsOnOptionId) {
      const dependency = db
        .select()
        .from(schema.assetGenerationOptions)
        .where(eq(schema.assetGenerationOptions.id, option.dependsOnOptionId))
        .get();
      if (!dependency || dependency.status !== "completed") {
        continue;
      }
    }

    const batch = db
      .select()
      .from(schema.assetGenerationBatches)
      .where(eq(schema.assetGenerationBatches.id, option.batchId))
      .get();
    if (batch?.status === "cancelled" || batch?.status === "archived") continue;
    return option;
  }

  return null;
}

export function getRunningAssetOptions(): AssetGenerationOption[] {
  const db = getDb();
  return db
    .select()
    .from(schema.assetGenerationOptions)
    .where(eq(schema.assetGenerationOptions.status, "running"))
    .all();
}

export function updateAssetOption(
  optionId: string,
  patch: Partial<typeof schema.assetGenerationOptions.$inferInsert>
) {
  const db = getDb();
  db.update(schema.assetGenerationOptions)
    .set(patch)
    .where(eq(schema.assetGenerationOptions.id, optionId))
    .run();
}

export function updateAssetBatch(
  batchId: string,
  patch: Partial<typeof schema.assetGenerationBatches.$inferInsert>
) {
  const db = getDb();
  db.update(schema.assetGenerationBatches)
    .set(patch)
    .where(eq(schema.assetGenerationBatches.id, batchId))
    .run();
}

export function refreshBatchStatus(batchId: string) {
  const data = getBatchWithOptions(batchId);
  if (!data) return;

  const { batch, options } = data;
  if (batch.status === "completed" || batch.status === "failed") return;

  const outcomeOptions =
    batch.entityType === "shot"
      ? filterSelectableShotOptions(options)
      : options;

  const anyFailed = outcomeOptions.some((o) => o.status === "failed");
  const allDone = outcomeOptions.every(
    (o) =>
      o.status === "completed" ||
      o.status === "failed" ||
      o.status === "cancelled"
  );
  const anyRunning = options.some(
    (o) => o.status === "running" || o.status === "queued"
  );
  const allCompleted = outcomeOptions.every((o) => o.status === "completed");

  if (anyRunning && batch.status === "queued") {
    updateAssetBatch(batchId, { status: "running" });
  }

  if (allCompleted) {
    updateAssetBatch(batchId, { status: "awaiting_selection" });
    return;
  }

  if (allDone && anyFailed && !options.some((o) => o.status === "completed")) {
    const failureLabel =
      batch.entityType === "location_angle"
        ? "All location reference options failed"
        : batch.entityType === "character_angle"
          ? "All character reference options failed"
          : batch.entityType === "shot"
            ? "All shot image options failed"
            : "All character sheet options failed";
    updateAssetBatch(batchId, {
      status: "failed",
      errorMessage: failureLabel,
      completedAt: Date.now(),
    });
  } else if (
    allDone &&
    options.some((o) => o.status === "completed")
  ) {
    updateAssetBatch(batchId, { status: "awaiting_selection" });
  } else if (
    allDone &&
    outcomeOptions.every((o) => o.status === "cancelled")
  ) {
    updateAssetBatch(batchId, {
      status: "cancelled",
      completedAt: Date.now(),
    });
  }
}

export async function selectCharacterSheetOption(
  projectId: string,
  characterId: string,
  stateId: string,
  optionId: string
): Promise<Character> {
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

  const state = getCharacterState(projectId, characterId, stateId);
  if (!state) throw new Error("Character state not found");

  const batchMatchesState =
    batch &&
    batch.projectId === projectId &&
    batch.entityType === "character_state" &&
    batch.entityId === stateId;
  const batchMatchesLegacy =
    batch &&
    batch.projectId === projectId &&
    batch.entityType === "character" &&
    batch.entityId === characterId;

  if (!batch || (!batchMatchesState && !batchMatchesLegacy)) {
    throw new Error("Option does not belong to this character state");
  }

  const character = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId))
    .get();

  if (!character) throw new Error("Character not found");

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
  const destRelative = `characters/${characterId}/states/${stateId}/reference${ext}`;
  const destAbs = path.join(projectRoot, destRelative);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(sourceAbs, destAbs);

  const ts = Date.now();
  db.update(schema.characterStates)
    .set({
      referencePath: destRelative.replace(/\\/g, "/"),
      referenceKind: "image",
      referenceSource: "comfyui",
      updatedAt: ts,
    })
    .where(eq(schema.characterStates.id, stateId))
    .run();

  const updatedState = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .get()!;

  syncCharacterReferenceFromState(characterId, updatedState, projectRoot);

  const updated = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId))
    .get()!;

  archiveBatchAfterReferenceSelection(batch.id, optionId);

  return updated;
}

export function resolveBatchContext(batch: AssetGenerationBatch): {
  kind: "character";
  characterId: string;
  stateId: string;
  angleId?: string;
} | {
  kind: "location";
  locationId: string;
  stateId: string;
  angleId: string;
} | {
  kind: "shot";
  shotId: string;
} {
  if (batch.entityType === "shot") {
    return { kind: "shot", shotId: batch.entityId };
  }

  if (batch.entityType === "location_angle") {
    const db = getDb();
    const angle = db
      .select()
      .from(schema.locationAngles)
      .where(eq(schema.locationAngles.id, batch.entityId))
      .get();
    if (!angle) throw new Error("Location angle missing for asset batch");

    const state = db
      .select()
      .from(schema.locationStates)
      .where(eq(schema.locationStates.id, angle.locationStateId))
      .get();
    if (!state) throw new Error("Location state missing for asset batch");

    return {
      kind: "location",
      locationId: state.locationId,
      stateId: state.id,
      angleId: angle.id,
    };
  }

  if (batch.entityType === "character_angle") {
    const db = getDb();
    const angle = db
      .select()
      .from(schema.characterAngles)
      .where(eq(schema.characterAngles.id, batch.entityId))
      .get();
    if (!angle) throw new Error("Character angle missing for asset batch");

    const state = db
      .select()
      .from(schema.characterStates)
      .where(eq(schema.characterStates.id, angle.characterStateId))
      .get();
    if (!state) throw new Error("Character state missing for asset batch");

    return {
      kind: "character",
      characterId: state.characterId,
      stateId: state.id,
      angleId: angle.id,
    };
  }

  const db = getDb();
  if (batch.entityType === "character_state") {
    const state = db
      .select()
      .from(schema.characterStates)
      .where(eq(schema.characterStates.id, batch.entityId))
      .get();
    if (!state) {
      throw new Error("Character state missing for asset batch");
    }
    return {
      kind: "character",
      characterId: state.characterId,
      stateId: state.id,
    };
  }

  const firstState = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.characterId, batch.entityId))
    .orderBy(
      asc(schema.characterStates.sortOrder),
      asc(schema.characterStates.createdAt)
    )
    .get();
  if (!firstState) {
    throw new Error("No character states found for legacy asset batch");
  }
  return {
    kind: "character",
    characterId: batch.entityId,
    stateId: firstState.id,
  };
}

export function getCandidateOutputPath(
  batch: AssetGenerationBatch,
  optionId: string
): string {
  const ctx = resolveBatchContext(batch);
  if (ctx.kind === "location") {
    return `locations/${ctx.locationId}/states/${ctx.stateId}/angles/${ctx.angleId}/candidates/${batch.id}/${optionId}.png`;
  }
  if (ctx.kind === "shot") {
    return `storyboard/shots/${ctx.shotId}/candidates/${batch.id}/${optionId}.png`;
  }
  if (ctx.angleId) {
    return `characters/${ctx.characterId}/states/${ctx.stateId}/angles/${ctx.angleId}/candidates/${batch.id}/${optionId}.png`;
  }
  return `characters/${ctx.characterId}/states/${ctx.stateId}/candidates/${batch.id}/${optionId}.png`;
}

export { getPipelineIsolateOutputPath, filterSelectableShotOptions } from "@/lib/shot-pipeline-shared";
