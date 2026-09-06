import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { HttpError } from "@/lib/api-helpers";
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
import { buildShotPlaceholderDescription, buildShotPlaceholderContext, resolveShotVirtualBackdrop } from "@/lib/services/shot-prompt";
import { collectShotCastNegativeTerms } from "@/lib/services/shot-placeholder-description";
import {
  buildShotPlaceholderPrompts,
  applyShotReferenceModePromptExtras,
  SHOT_IMAGE_EDIT_INSTRUCTION_SUFFIX,
} from "@/lib/services/prompt-preprocess";
import { mergeUniqueNegativeTerms } from "@/lib/services/prompt-negation-sanitize";
import { BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID } from "@/lib/db/builtin-template-ids";
import { mergeImageNegativePrompt } from "@/lib/services/image-generation-overrides";
import {
  parseShotRenderOverrides,
  SHOT_SUBJECT_POSITION_ANCHORS,
  SHOT_SUBJECT_SCALE_FRACTIONS,
} from "@/lib/shot-render-overrides";
import { detectIntegrateFramingIntent } from "@/lib/integrate-subject-mask";
import { SHOT_IDENTITY_STRENGTH_PRESETS } from "@/lib/ip-adapter-profiles";
import { parseVisualStyle } from "@/lib/services/visual-style";
import { ensureProjectStillImageSettings } from "@/lib/services/generation-stack";
import { isIpAdapterAvailable } from "@/lib/services/comfyui-client";
import {
  resolveShotStillReferencePlan,
  type ShotStillReferenceMode,
} from "@/lib/services/shot-still-reference-mode";
import {
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";
import { listEndpoints } from "@/lib/services/comfyui-client";
import {
  isCompositingPipelineAvailable,
  isFaceRefineAvailable,
} from "@/lib/services/compositing-pipeline";
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
  archiveBatchAfterReferenceSelection,
  listRetainedBatchesForEntity,
} from "@/lib/services/asset-generation-queue";

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

import {
  resolveShotReferencePaths,
} from "@/lib/services/shot-reference";

export async function resolveShotPlaceholderTemplateId(
  projectId: string,
  options?: {
    referencePath?: string | null;
    characterReferencePath?: string | null;
    locationReferencePath?: string | null;
    characterName?: string | null;
    locationStateName?: string | null;
    locationAngleName?: string | null;
    endpointUrl?: string;
    stillReferenceMode?: ShotStillReferenceMode;
    virtualBackdrop?: boolean;
    compositingPipelineAvailable?: boolean;
  }
): Promise<string> {
  const compositingPipelineAvailable =
    options?.compositingPipelineAvailable ??
    (options?.endpointUrl
      ? await isCompositingPipelineAvailable(options.endpointUrl)
      : false);

  const plan = resolveShotStillReferencePlan(
    {
      characterPath: options?.characterReferencePath ?? null,
      locationPath: options?.locationReferencePath ?? null,
      characterName: options?.characterName ?? null,
      locationStateName: options?.locationStateName ?? null,
      locationAngleName: options?.locationAngleName ?? null,
    },
    options?.stillReferenceMode ?? "auto",
    {
      virtualBackdrop: options?.virtualBackdrop,
      compositingPipelineAvailable,
    }
  );

  // Scene edit runs on Qwen Image Edit, not IP-Adapter; the worker asserts
  // its node classes at generation time, so don't gate it on IP-Adapter here.
  if (plan.workflowTemplateId && plan.effectiveMode === "scene_edit") {
    return plan.workflowTemplateId;
  }

  if (
    plan.workflowTemplateId &&
    options?.endpointUrl &&
    (await isIpAdapterAvailable(options.endpointUrl))
  ) {
    return plan.workflowTemplateId;
  }

  if (
    plan.useIpAdapter &&
    options?.endpointUrl &&
    !(await isIpAdapterAvailable(options.endpointUrl))
  ) {
    const primary =
      options.referencePath ??
      options.characterReferencePath ??
      options.locationReferencePath;
    if (primary) {
      // IP-Adapter unavailable: fall through to txt2img below.
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
    throw new HttpError(
      "A shot image batch is already in progress. Discard it first or regenerate.",
      409
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
  const shotOverrides = parseShotRenderOverrides(shot.renderOverridesJson);
  const stillReferenceMode = shotOverrides.stillReferenceMode ?? "auto";
  const virtualBackdrop = resolveShotVirtualBackdrop(shotId);
  const compositingPipelineAvailable = await isCompositingPipelineAvailable(
    endpointUrl
  );
  const referencePlan = resolveShotStillReferencePlan(
    {
      characterPath: referencePaths.characterPath,
      locationPath: referencePaths.locationPath,
      characterName: referencePaths.characterName,
      locationStateName: referencePaths.locationStateName,
      locationAngleName: referencePaths.locationAngleName,
    },
    stillReferenceMode,
    { virtualBackdrop, compositingPipelineAvailable }
  );

  // Per-shot character likeness. Balanced uses the strong integrate default.
  // Low and high still override. Applied whenever character IP-Adapter drives
  // a single chain (integrate / character-only).
  const identityStrength = shotOverrides.identityStrength ?? "balanced";
  if (
    SHOT_IDENTITY_STRENGTH_PRESETS[identityStrength] &&
    (referencePlan.effectiveMode === "integrate_in_scene" ||
      referencePlan.effectiveMode === "character")
  ) {
    const preset = SHOT_IDENTITY_STRENGTH_PRESETS[identityStrength];
    referencePlan.generationOptions.ipAdapterWeight = preset.weight;
    referencePlan.generationOptions.ipAdapterEndAt = preset.endAt;
  }

  // Integrate in scene: per-shot subject scale and position presets drive the
  // inpaint mask geometry (this is the explicit scale control, unlike prompt
  // language the model can ignore).
  if (referencePlan.effectiveMode === "integrate_in_scene") {
    const subjectScale = shotOverrides.subjectScale;
    if (subjectScale && SHOT_SUBJECT_SCALE_FRACTIONS[subjectScale] != null) {
      referencePlan.generationOptions.integrateSubjectHeightFraction =
        SHOT_SUBJECT_SCALE_FRACTIONS[subjectScale];
    } else {
      // No explicit size preset: honor framing language in the shot prompt
      // (medium shot, close-up). Otherwise the model paints the large framing
      // the prompt asks for and the small default mask box crops the head and
      // legs mid-frame.
      const framing = detectIntegrateFramingIntent(shot.prompt ?? "");
      if (framing) {
        referencePlan.generationOptions.integrateSubjectHeightFraction =
          framing.heightFraction;
        referencePlan.generationOptions.integrateSubjectGroundY =
          framing.groundY;
      }
    }
    const subjectPosition = shotOverrides.subjectPosition;
    if (
      subjectPosition &&
      SHOT_SUBJECT_POSITION_ANCHORS[subjectPosition] != null
    ) {
      referencePlan.generationOptions.integrateSubjectAnchorX =
        SHOT_SUBJECT_POSITION_ANCHORS[subjectPosition];
    }
  }

  const templateId = await resolveShotPlaceholderTemplateId(projectId, {
    referencePath: referencePaths.primaryPath,
    characterReferencePath: referencePaths.characterPath,
    locationReferencePath: referencePaths.locationPath,
    characterName: referencePaths.characterName,
    locationStateName: referencePaths.locationStateName,
    locationAngleName: referencePaths.locationAngleName,
    endpointUrl,
    stillReferenceMode,
    virtualBackdrop,
    compositingPipelineAvailable,
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

  await ensureProjectStillImageSettings(projectId, endpointUrl, { templateId });

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
  const { processedPrompt, negativePrompt } = await buildShotPlaceholderPrompts(
    shotLabel,
    shotPrompt,
    visualStyle,
    {
      context: shotContext || undefined,
      // Character reference image carries likeness and wardrobe. Look-text
      // wardrobe locks were reintroducing stale humanoid / dress wording.
      wardrobeLock: null,
      hasLocationReference: referencePlan.hasLocationReferenceForPrompt,
    }
  );
  let finalProcessedPrompt = processedPrompt;
  const promptExtras = applyShotReferenceModePromptExtras(
    processedPrompt,
    mergeUniqueNegativeTerms(
      negativePrompt,
      collectShotCastNegativeTerms(cast)
    ),
    referencePlan
  );
  finalProcessedPrompt = promptExtras.processedPrompt;
  const renderSettingsParsed = JSON.parse(
    project.renderSettingsJson || "{}"
  ) as RenderSettings;
  let finalNegativePrompt = mergeImageNegativePrompt(
    promptExtras.negativePrompt,
    renderSettingsParsed.imageDefaultNegative,
    shotOverrides.stillNegativePrompt
  );

  // Face detail pass: opt-in per shot, needs a character reference for
  // likeness and the Impact Pack nodes on the render host. Chained as a
  // dependent option so it runs on each finished still automatically.
  const faceRefineRequested =
    shotOverrides.faceDetail === "refine" &&
    Boolean(referencePlan.characterPath);
  const faceRefineEnabled =
    faceRefineRequested && (await isFaceRefineAvailable(endpointUrl));
  if (faceRefineRequested && !faceRefineEnabled) {
    console.warn(
      "[shots] Face detail pass requested but ComfyUI is missing Impact Pack nodes; generating without it"
    );
  }

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
    processedPrompt: finalProcessedPrompt,
    negativePrompt: finalNegativePrompt,
    generationOptionsJson: JSON.stringify(referencePlan.generationOptions),
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
    if (referencePlan.useCompositingPipeline) {
      const pipelineGroupId = nanoid();
      const characterOptionId = nanoid();
      const compositeOptionId = nanoid();

      db.insert(schema.assetGenerationOptions)
        .values({
          id: characterOptionId,
          batchId,
          variantIndex: i,
          seed: randomSeed(),
          status: "queued",
          pipelineStage: "character",
          pipelineGroupId,
          createdAt: ts,
        })
        .run();

      db.insert(schema.assetGenerationOptions)
        .values({
          id: compositeOptionId,
          batchId,
          variantIndex: i,
          seed: randomSeed(),
          status: "queued",
          pipelineStage: "composite",
          pipelineGroupId,
          dependsOnOptionId: characterOptionId,
          createdAt: ts,
        })
        .run();

      if (faceRefineEnabled) {
        db.insert(schema.assetGenerationOptions)
          .values({
            id: nanoid(),
            batchId,
            variantIndex: i,
            seed: randomSeed(),
            status: "queued",
            pipelineStage: "face_refine",
            pipelineGroupId,
            dependsOnOptionId: compositeOptionId,
            createdAt: ts,
          })
          .run();
      }
      continue;
    }

    if (faceRefineEnabled) {
      // Two-stage: base render, then a face detail pass on its output. Only
      // the refined result is selectable.
      const pipelineGroupId = nanoid();
      const baseOptionId = nanoid();

      db.insert(schema.assetGenerationOptions)
        .values({
          id: baseOptionId,
          batchId,
          variantIndex: i,
          seed: randomSeed(),
          status: "queued",
          pipelineStage: "base",
          pipelineGroupId,
          createdAt: ts,
        })
        .run();

      db.insert(schema.assetGenerationOptions)
        .values({
          id: nanoid(),
          batchId,
          variantIndex: i,
          seed: randomSeed(),
          status: "queued",
          pipelineStage: "face_refine",
          pipelineGroupId,
          dependsOnOptionId: baseOptionId,
          createdAt: ts,
        })
        .run();
      continue;
    }

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

/**
 * Instruction-based edit of a finished still (Qwen Image Edit): fix sign
 * text, remove an object, adjust lighting. Creates a new pack whose source is
 * the selected candidate image.
 */
export async function enqueueShotImageEditBatch(
  projectId: string,
  shotId: string,
  sourceOptionId: string,
  instruction: string,
  sampleCount: number,
  options?: { replace?: boolean }
): Promise<AssetGenerationBatch> {
  await assertDependency("comfyui");

  const trimmedInstruction = instruction.trim();
  if (!trimmedInstruction) {
    throw new HttpError("Describe the edit to make", 400);
  }

  const count = Math.min(4, Math.max(1, sampleCount));
  const db = getDb();

  const sourceOption = db
    .select()
    .from(schema.assetGenerationOptions)
    .where(eq(schema.assetGenerationOptions.id, sourceOptionId))
    .get();
  if (
    !sourceOption ||
    sourceOption.status !== "completed" ||
    !sourceOption.outputPath
  ) {
    throw new HttpError("Source image is not ready to edit", 400);
  }

  const sourceBatch = db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, sourceOption.batchId))
    .get();
  if (
    !sourceBatch ||
    sourceBatch.projectId !== projectId ||
    sourceBatch.entityType !== "shot" ||
    sourceBatch.entityId !== shotId
  ) {
    throw new HttpError("Source image does not belong to this shot", 400);
  }

  const priorBatch = getActiveBatchForShot(shotId);
  if (priorBatch && !options?.replace) {
    throw new HttpError(
      "A shot image batch is already in progress. Discard it first or regenerate.",
      409
    );
  }

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get()!;
  const projectRoot = resolveProjectRoot(project);
  const sourceAbs = resolveMediaPath(projectRoot, sourceOption.outputPath);
  if (!fs.existsSync(sourceAbs)) {
    throw new HttpError("Source image file missing on disk", 400);
  }

  const appEndpoints = await getDefaultComfyuiEndpoints();
  const endpoints = resolveComfyuiEndpoints(
    project.comfyuiEndpointsJson,
    appEndpoints
  );
  const endpointUrl = await listEndpoints(endpoints);
  if (!endpointUrl) {
    throw new Error("No reachable ComfyUI endpoint configured");
  }

  const ts = Date.now();
  const batchId = nanoid();
  const processedPrompt = `${trimmedInstruction}${
    trimmedInstruction.endsWith(".") ? "" : "."
  } ${SHOT_IMAGE_EDIT_INSTRUCTION_SUFFIX}`;

  db.insert(schema.assetGenerationBatches)
    .values({
      id: batchId,
      projectId,
      entityType: "shot",
      entityId: shotId,
      workflowTemplateId: BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID,
      comfyuiEndpointUrl: endpointUrl,
      status: "queued",
      sampleCount: count,
      rawPrompt: trimmedInstruction,
      processedPrompt,
      negativePrompt: "",
      generationOptionsJson: JSON.stringify({
        imageEditSourcePath: sourceOption.outputPath,
      }),
      createdAt: ts,
    })
    .run();

  const candidateDir = path.join(
    projectRoot,
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

  archiveBatchAfterReferenceSelection(batch.id, optionId);

  return updated;
}

export function getShotCandidateOutputPath(
  shotId: string,
  batchId: string,
  optionId: string
): string {
  return `storyboard/shots/${shotId}/candidates/${batchId}/${optionId}.png`;
}
