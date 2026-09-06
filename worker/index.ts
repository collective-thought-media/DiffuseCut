import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { AssetGenerationOption, ExportJob, RenderJob } from "@/lib/db/schema";
import {
  ensureProjectDirs,
  resolveMediaPath,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import {
  checkAllDependencies,
  formatDependencySummary,
} from "@/lib/services/dependency-checker";
import { resolveComfyNodeLabel } from "@/lib/asset-generation-status";
import {
  CLIP_VISION_SDXL_FILENAME,
  resolveSdxlPlusIpAdapterFilename,
  resolveSdxlPlusFaceIpAdapterFilename,
} from "@/lib/services/comfyui-workflow-requirements";
import {
  downloadOutput,
  extractOutputFiles,
  findPromptQueueState,
  getHistory,
  getQueue,
  queuePrompt,
  uploadAnchorReferenceImage,
  uploadCharacterReferenceImage,
  uploadLocationReferenceImage,
  uploadLocationPlateImage,
  uploadCharacterIsolateImage,
  uploadFaceRefineSourceImage,
  uploadImageEditSourceImage,
  uploadMedia,
  assertComfyuiNodeClasses,
  getModels,
} from "@/lib/services/comfyui-client";
import {
  resolveShotReferencePathForBatch,
  resolveShotDualReferencePathsForBatch,
  resolveShotCanonicalFacePathForBatch,
} from "@/lib/services/shot-reference";
import {
  shouldUseMacroDetailLatent,
  SHOT_MACRO_LATENT_HEIGHT,
  SHOT_MACRO_LATENT_WIDTH,
} from "@/lib/services/shot-composition";
import { ComfyUIWsBridge } from "@/lib/services/comfyui-ws-bridge";
import { acquireWorkerLock, releaseWorkerLock } from "./worker-lock";
import {
  buildWorkflowPayload,
  type UploadedRefs,
} from "@/lib/services/workflow-builder";
import {
  getNextQueuedRenderJob,
  getRunningRenderJobs,
} from "@/lib/services/render-queue";
import {
  getNextQueuedAssetOption,
  getRunningAssetOptions,
  updateAssetOption,
  refreshBatchStatus,
  getCandidateOutputPath,
  getPipelineIsolateOutputPath,
  resolveBatchContext,
} from "@/lib/services/asset-generation-queue";
import {
  buildCharacterIsolateNegative,
  buildCharacterIsolatePrompt,
  buildFaceRefinePrompt,
  pipelineStageStatusLabel,
  resolveAssetOptionTemplateId,
} from "@/lib/services/shot-pipeline";
import { COMPOSITING_NODE_CLASSES } from "@/lib/services/compositing-pipeline";
import { buildPortraitPayload } from "@/lib/services/workflow-builder";
import {
  resolveCharacterAnchorReframeIntensity,
  resolveLocationAnchorReframeIntensity,
  extractAnchoredViewDescription,
} from "@/lib/anchor-reframe";
import { getLocationIpAdapterProfile } from "@/lib/ip-adapter-profiles";
import { resolveShotReframeIntensity } from "@/lib/services/prompt-preprocess";
import type { LocationReferenceGenerationOptions } from "@/types";
import {
  resolveLocationAnchorReferencePathForBatch,
} from "@/lib/services/location-asset-generation";
import {
  resolveCharacterAnchorReferencePathForBatch,
} from "@/lib/services/character-asset-generation";
import {
  BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID,
  BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID,
  BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
  BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID,
  BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID,
} from "@/lib/db/seed-builtin-templates";
import { resolveOutputFrameSize } from "@/lib/services/export-filters";
import { computeIntegrateSubjectMaskBox } from "@/lib/integrate-subject-mask";
import { readImageDimensions } from "@/lib/services/image-dimensions";
import {
  conformVideoToExactSize,
  isVideoRenderFile,
  runExport,
  type ExportSettings,
} from "@/lib/services/ffmpeg-export";
import { formatComfyuiError } from "@/lib/services/comfyui-errors";
import {
  ensureProjectStillImageSettings,
  withResolvedCheckpoint,
} from "@/lib/services/generation-stack";
import {
  filterImageGenerationCheckpoints,
  resolveCheckpointForIpAdapter,
  shortCheckpointLabel,
} from "@/lib/services/image-checkpoints";
import {
  hydrateProjectRenderSettings,
  parseProjectRenderSettings,
} from "@/lib/services/render-settings-resolver";
import {
  buildLipSyncShotPrompt,
  getLipSyncDialogText,
  LIP_SYNC_SEED,
} from "@/lib/services/lip-sync";
import { buildShotCharacterLookSuffix, resolveCharacterStateForCast } from "@/lib/services/character-states";
import { parseVisualStyle } from "@/lib/services/visual-style";
import {
  resolveCharacterSheetReferenceDimensions,
  resolveFrontBackDiptychDimensions,
  type ReferenceAspectRatioPreset,
} from "@/lib/services/reference-aspect-ratio";
import type { RenderSettings } from "@/types";

const POLL_INTERVAL_MS = 2000;
const LOCATION_ANCHOR_TEMPLATE_IDS = new Set([
  BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID,
  BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID,
  BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID,
  BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID,
  BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID,
  BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID,
]);
const activeBridges = new Map<string, ComfyUIWsBridge>();
const activeAssetBridges = new Map<string, ComfyUIWsBridge>();
type BatchAnchorUploads = {
  primary?: string;
  secondary?: string;
  isolate?: string;
};
const anchorUploadByBatch = new Map<string, BatchAnchorUploads>();

function parseBatchGenerationOptions(
  json: string | null | undefined
): LocationReferenceGenerationOptions {
  if (!json) return {};
  try {
    return JSON.parse(json) as LocationReferenceGenerationOptions;
  } catch {
    return {};
  }
}

function now(): number {
  return Date.now();
}

async function resolveShotOptionReferenceImages(
  batch: typeof schema.assetGenerationBatches.$inferSelect,
  option: AssetGenerationOption,
  projectRoot: string
): Promise<BatchAnchorUploads> {
  const { characterPath, locationPath } =
    resolveShotDualReferencePathsForBatch(batch);

  if (option.pipelineStage === "character") {
    const uploads: BatchAnchorUploads = {};
    if (characterPath) {
      const characterAbs = resolveMediaPath(projectRoot, characterPath);
      if (fs.existsSync(characterAbs)) {
        uploads.primary = await uploadCharacterReferenceImage(
          batch.comfyuiEndpointUrl,
          characterAbs
        );
      }
    }
    if (uploads.primary) {
      anchorUploadByBatch.set(`${batch.id}:${option.id}`, uploads);
    }
    return uploads;
  }

  if (option.pipelineStage === "face_refine") {
    // Face detail pass: the source image is the finished render from the
    // stage this option depends on; the character reference drives the face
    // IP-Adapter for likeness. Prefer the character's default-state portrait
    // (the casting look) over the per-state reference so the same face anchors
    // every outfit and scene.
    const uploads: BatchAnchorUploads = {};
    const facePath =
      resolveShotCanonicalFacePathForBatch(batch) ?? characterPath;
    if (facePath) {
      const characterAbs = resolveMediaPath(projectRoot, facePath);
      if (fs.existsSync(characterAbs)) {
        uploads.primary = await uploadCharacterReferenceImage(
          batch.comfyuiEndpointUrl,
          characterAbs
        );
      }
    }
    if (option.dependsOnOptionId) {
      const db = getDb();
      const dependency = db
        .select()
        .from(schema.assetGenerationOptions)
        .where(eq(schema.assetGenerationOptions.id, option.dependsOnOptionId))
        .get();
      if (dependency?.outputPath) {
        const sourceAbs = resolveMediaPath(projectRoot, dependency.outputPath);
        if (fs.existsSync(sourceAbs)) {
          uploads.isolate = await uploadFaceRefineSourceImage(
            batch.comfyuiEndpointUrl,
            sourceAbs
          );
        }
      }
    }
    if (uploads.primary || uploads.isolate) {
      anchorUploadByBatch.set(`${batch.id}:${option.id}`, uploads);
    }
    return uploads;
  }

  if (option.pipelineStage === "composite") {
    const uploads: BatchAnchorUploads = {};
    if (characterPath) {
      const characterAbs = resolveMediaPath(projectRoot, characterPath);
      if (fs.existsSync(characterAbs)) {
        uploads.primary = await uploadCharacterReferenceImage(
          batch.comfyuiEndpointUrl,
          characterAbs
        );
      }
    }
    if (locationPath) {
      const locationAbs = resolveMediaPath(projectRoot, locationPath);
      if (fs.existsSync(locationAbs)) {
        uploads.secondary = await uploadLocationPlateImage(
          batch.comfyuiEndpointUrl,
          locationAbs
        );
      }
    }
    if (option.dependsOnOptionId) {
      const db = getDb();
      const dependency = db
        .select()
        .from(schema.assetGenerationOptions)
        .where(eq(schema.assetGenerationOptions.id, option.dependsOnOptionId))
        .get();
      if (dependency?.outputPath) {
        const isolateAbs = resolveMediaPath(projectRoot, dependency.outputPath);
        if (fs.existsSync(isolateAbs)) {
          uploads.isolate = await uploadCharacterIsolateImage(
            batch.comfyuiEndpointUrl,
            isolateAbs
          );
        }
      }
    }
    if (uploads.primary || uploads.secondary || uploads.isolate) {
      anchorUploadByBatch.set(`${batch.id}:${option.id}`, uploads);
    }
    return uploads;
  }

  if (batch.workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID) {
    const uploads: BatchAnchorUploads = {};
    if (characterPath) {
      const characterAbs = resolveMediaPath(projectRoot, characterPath);
      if (fs.existsSync(characterAbs)) {
        uploads.primary = await uploadCharacterReferenceImage(
          batch.comfyuiEndpointUrl,
          characterAbs
        );
      }
    }
    if (locationPath) {
      const locationAbs = resolveMediaPath(projectRoot, locationPath);
      if (fs.existsSync(locationAbs)) {
        uploads.secondary = await uploadLocationReferenceImage(
          batch.comfyuiEndpointUrl,
          locationAbs
        );
      }
    }
    if (uploads.primary || uploads.secondary) {
      anchorUploadByBatch.set(batch.id, uploads);
    }
    return uploads;
  }

  if (batch.workflowTemplateId === BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID) {
    // Instruction edit: the only input is the finished still being edited,
    // referenced by relative path in the batch generation options.
    const uploads: BatchAnchorUploads = {};
    const options = parseBatchGenerationOptions(batch.generationOptionsJson);
    if (options.imageEditSourcePath) {
      const sourceAbs = resolveMediaPath(
        projectRoot,
        options.imageEditSourcePath
      );
      if (fs.existsSync(sourceAbs)) {
        uploads.secondary = await uploadImageEditSourceImage(
          batch.comfyuiEndpointUrl,
          sourceAbs
        );
      }
    }
    if (uploads.secondary) {
      anchorUploadByBatch.set(batch.id, uploads);
    }
    return uploads;
  }

  if (
    batch.workflowTemplateId === BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID ||
    batch.workflowTemplateId ===
      BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID ||
    batch.workflowTemplateId === BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID
  ) {
    const uploads: BatchAnchorUploads = {};
    if (characterPath) {
      const characterAbs = resolveMediaPath(projectRoot, characterPath);
      if (fs.existsSync(characterAbs)) {
        uploads.primary = await uploadCharacterReferenceImage(
          batch.comfyuiEndpointUrl,
          characterAbs
        );
      }
    }
    if (locationPath) {
      const locationAbs = resolveMediaPath(projectRoot, locationPath);
      if (fs.existsSync(locationAbs)) {
        uploads.secondary = await uploadLocationPlateImage(
          batch.comfyuiEndpointUrl,
          locationAbs
        );
      }
    }
    if (uploads.primary || uploads.secondary) {
      anchorUploadByBatch.set(batch.id, uploads);
    }
    return uploads;
  }

  const anchorRelative = resolveShotReferencePathForBatch(batch);
  const uploads: BatchAnchorUploads = {};
  if (anchorRelative) {
    const anchorAbs = resolveMediaPath(projectRoot, anchorRelative);
    if (fs.existsSync(anchorAbs)) {
      uploads.primary = await uploadAnchorReferenceImage(
        batch.comfyuiEndpointUrl,
        anchorAbs
      );
    }
  }
  if (uploads.primary) {
    anchorUploadByBatch.set(batch.id, uploads);
  }
  return uploads;
}

async function resolveBatchAnchorReferenceImages(
  batch: typeof schema.assetGenerationBatches.$inferSelect,
  projectRoot: string
): Promise<BatchAnchorUploads> {
  const cached = anchorUploadByBatch.get(batch.id);
  if (cached) return cached;

  const uploads: BatchAnchorUploads = {};

  if (batch.entityType === "location_angle") {
    const anchorRelative = resolveLocationAnchorReferencePathForBatch(batch);
    if (anchorRelative) {
      const anchorAbs = resolveMediaPath(projectRoot, anchorRelative);
      if (fs.existsSync(anchorAbs)) {
        uploads.primary = await uploadAnchorReferenceImage(
          batch.comfyuiEndpointUrl,
          anchorAbs
        );
      }
    }
  }

  if (batch.entityType === "character_angle") {
    const anchorRelative = resolveCharacterAnchorReferencePathForBatch(batch);
    if (anchorRelative) {
      const anchorAbs = resolveMediaPath(projectRoot, anchorRelative);
      if (fs.existsSync(anchorAbs)) {
        uploads.primary = await uploadAnchorReferenceImage(
          batch.comfyuiEndpointUrl,
          anchorAbs
        );
      }
    }
  }

  if (uploads.primary || uploads.secondary) {
    anchorUploadByBatch.set(batch.id, uploads);
  }
  return uploads;
}

function clearBatchAnchorUpload(batchId: string): void {
  anchorUploadByBatch.delete(batchId);
}

function maybeClearBatchAnchorUpload(batchId: string): void {
  const db = getDb();
  const batch = db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, batchId))
    .get();

  if (
    batch &&
    (batch.status === "awaiting_selection" ||
      batch.status === "cancelled" ||
      batch.status === "failed" ||
      batch.status === "completed")
  ) {
    clearBatchAnchorUpload(batchId);
  }
}

function updateRenderJob(
  jobId: string,
  patch: Partial<typeof schema.renderJobs.$inferInsert>
): void {
  const db = getDb();
  db.update(schema.renderJobs)
    .set(patch)
    .where(eq(schema.renderJobs.id, jobId))
    .run();
}

function updateExportJob(
  jobId: string,
  patch: Partial<typeof schema.exportJobs.$inferInsert>
): void {
  const db = getDb();
  db.update(schema.exportJobs)
    .set(patch)
    .where(eq(schema.exportJobs.id, jobId))
    .run();
}

function failRenderJob(job: RenderJob, message: string): void {
  const ts = now();
  updateRenderJob(job.id, {
    status: "failed",
    errorMessage: formatComfyuiError(message),
    statusMessage: "Failed",
    completedAt: ts,
    lastHeartbeatAt: ts,
  });

  const db = getDb();
  db.update(schema.shots)
    .set({ renderStatus: "failed", updatedAt: ts })
    .where(eq(schema.shots.id, job.shotId))
    .run();

  activeBridges.get(job.id)?.disconnect();
  activeBridges.delete(job.id);
}

async function collectUploadedRefs(
  job: RenderJob,
  endpointUrl: string
): Promise<UploadedRefs> {
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, job.shotId))
    .get();

  if (!shot) return {};

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, job.projectId))
    .get();

  if (!project) return {};

  const projectRoot = resolveProjectRoot(project);
  const refs: UploadedRefs = { characterImages: {} };

  const uploadIfExists = async (
    relativePath: string | null | undefined,
    kind: "image" | "video"
  ): Promise<string | undefined> => {
    if (!relativePath) return undefined;
    const absolute = resolveMediaPath(projectRoot, relativePath);
    if (!fs.existsSync(absolute)) return undefined;
    const uploaded = await uploadMedia(endpointUrl, absolute, { kind });
    return uploaded.name;
  };

  if (shot.placeholderPath) {
    const kind = shot.placeholderKind === "video" ? "video" : "image";
    const uploaded = await uploadIfExists(shot.placeholderPath, kind);
    if (kind === "video" && uploaded) refs.video = uploaded;
    if (kind === "image" && uploaded) refs.image = uploaded;
  }

  if (shot.locationId) {
    const location = db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.id, shot.locationId))
      .get();
    if (location?.referencePath) {
      const kind = location.referenceKind === "video" ? "video" : "image";
      const uploaded = await uploadIfExists(location.referencePath, kind);
      if (kind === "image" && uploaded) refs.locationImage = uploaded;
      if (kind === "video" && uploaded) refs.video = uploaded;
    }
  }

  const shotCharacterRows = db
    .select()
    .from(schema.shotCharacters)
    .where(eq(schema.shotCharacters.shotId, shot.id))
    .all();

  for (const row of shotCharacterRows) {
    const character = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, row.characterId))
      .get();
    const state = resolveCharacterStateForCast(
      row.characterId,
      row.characterStateId
    );
    const referencePath = state?.referencePath ?? character?.referencePath;
    if (!referencePath) continue;
    const kind =
      (state?.referenceKind ?? character?.referenceKind) === "video"
        ? "video"
        : "image";
    const uploaded = await uploadIfExists(referencePath, kind);
    if (kind === "image" && uploaded) {
      refs.characterImages![character!.id] = uploaded;
    }
    if (kind === "video" && uploaded) {
      refs.video = uploaded;
    }
  }

  if (job.lipSyncAudioPath) {
    const absolute = resolveMediaPath(projectRoot, job.lipSyncAudioPath);
    if (!fs.existsSync(absolute)) {
      throw new Error(
        `Lip sync audio file missing: ${job.lipSyncAudioPath}. Re-queue the lip sync render from the Dialog tab.`
      );
    }
    // Unique per-job filename so a queued job never picks up a stale upload.
    const uploaded = await uploadMedia(job.comfyuiEndpointUrl, absolute, {
      kind: "audio",
      uploadFileName: `DiffuseCutLipSync-${job.id}.wav`,
      overwrite: true,
    });
    refs.audio = uploaded.name;
  }

  return refs;
}

async function startRenderJob(job: RenderJob): Promise<void> {
  const db = getDb();
  const ts = now();

  updateRenderJob(job.id, {
    status: "running",
    statusMessage: "Starting render",
    lastHeartbeatAt: ts,
    progress: 0,
  });

  db.update(schema.shots)
    .set({ renderStatus: "rendering", updatedAt: ts })
    .where(eq(schema.shots.id, job.shotId))
    .run();

  try {
    const shot = db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.id, job.shotId))
      .get();
    const template = db
      .select()
      .from(schema.workflowTemplates)
      .where(eq(schema.workflowTemplates.id, job.workflowTemplateId))
      .get();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, job.projectId))
      .get();

    if (!shot || !template || !project) {
      throw new Error("Missing shot, template, or project for render job");
    }

    const visualStyle = parseVisualStyle(project.visualStyleJson);
    const lookSuffix = buildShotCharacterLookSuffix(job.shotId);
    let jobPrompt = lookSuffix
      ? `${shot.prompt.trim()}, ${lookSuffix}`.trim()
      : shot.prompt;
    if (job.lipSyncAudioPath) {
      jobPrompt = buildLipSyncShotPrompt(
        jobPrompt,
        getLipSyncDialogText(job.projectId, job.shotId)
      );
    }
    const styledShot = { ...shot, prompt: jobPrompt };
    const { renderSettings: resolvedSettings } =
      await hydrateProjectRenderSettings(job.projectId, {
        template,
        persist: true,
        updateAppDefaults: true,
      });
    // Lip sync articulation is seed sensitive; pin the proven seed so a
    // random seed can't silently render a closed mouth (see LIP_SYNC_SEED).
    const settingsForJob = job.lipSyncAudioPath
      ? { ...resolvedSettings, seedMode: "fixed" as const, seed: LIP_SYNC_SEED }
      : resolvedSettings;
    const uploadedRefs = await collectUploadedRefs(job, job.comfyuiEndpointUrl);

    const fps = project.defaultFps ?? 24;

    const { workflow, clientId } = buildWorkflowPayload(
      template,
      JSON.parse(template.bindingsJson || "{}"),
      settingsForJob,
      styledShot,
      uploadedRefs,
      {
        checkpoint:
          resolvedSettings.videoCheckpoint ?? resolvedSettings.checkpoint,
        visualStyle,
        fps,
        shotIndex: shot.sortOrder,
        outputFilenamePrefix: `diffusecut/${job.projectId}/${shot.id}`,
      }
    );

    const promptRef = { id: null as string | null };

    const bridge = new ComfyUIWsBridge({
      baseUrl: job.comfyuiEndpointUrl,
      clientId,
      onUpdate: (update) => {
        if (
          "promptId" in update &&
          update.promptId &&
          promptRef.id &&
          update.promptId !== promptRef.id
        ) {
          return;
        }

        const heartbeat = now();
        if (update.type === "executing") {
          const db = getDb();
          const current = db
            .select()
            .from(schema.renderJobs)
            .where(eq(schema.renderJobs.id, job.id))
            .get();
          const nodeLabel = update.nodeId ? `Node ${update.nodeId}` : "Finalizing";
          updateRenderJob(job.id, {
            currentNodeId: update.nodeId,
            currentNodeLabel: nodeLabel,
            statusMessage: update.nodeId
              ? `Executing node ${update.nodeId}`
              : "Finalizing",
            progress: update.nodeId
              ? Math.max(current?.progress ?? 0, 0.08)
              : current?.progress,
            lastHeartbeatAt: heartbeat,
          });
        } else if (update.type === "progress") {
          const progress =
            update.max > 0 ? update.value / update.max : 0;
          updateRenderJob(job.id, {
            progress,
            progressStep: update.value,
            progressMax: update.max,
            currentNodeId: update.nodeId,
            currentNodeLabel: update.nodeId ? `Node ${update.nodeId}` : null,
            statusMessage: `Progress ${update.value}/${update.max}`,
            lastHeartbeatAt: heartbeat,
          });
        } else if (update.type === "execution_error") {
          failRenderJob(job, update.message);
        }
      },
      onError: (error) => {
        updateRenderJob(job.id, {
          statusMessage: error.message,
          lastHeartbeatAt: now(),
        });
      },
    });

    activeBridges.set(job.id, bridge);
    await bridge.connect();

    const queued = await queuePrompt(
      job.comfyuiEndpointUrl,
      workflow,
      clientId
    );

    updateRenderJob(job.id, {
      comfyuiPromptId: queued.prompt_id,
      payloadJson: JSON.stringify({ workflow, clientId }),
      statusMessage: "Queued on ComfyUI",
      lastHeartbeatAt: now(),
    });
    promptRef.id = queued.prompt_id;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Render start failed";
    failRenderJob(job, message);
  }
}

async function pollRenderJobProgress(job: RenderJob): Promise<void> {
  if (!job.comfyuiPromptId || job.status !== "running") return;

  const db = getDb();
  const latest = db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.id, job.id))
    .get();
  if (!latest || !latest.comfyuiPromptId) return;

  const promptId = latest.comfyuiPromptId;

  const heartbeat = now();
  const lastHeartbeat = latest.lastHeartbeatAt ?? latest.createdAt;
  const staleForMs = heartbeat - lastHeartbeat;

  try {
    const queue = await getQueue(latest.comfyuiEndpointUrl);
    const queueState = findPromptQueueState(queue, promptId);

    if (queueState === "pending") {
      updateRenderJob(latest.id, {
        statusMessage: "Waiting in ComfyUI queue",
        lastHeartbeatAt: heartbeat,
      });
      return;
    }

    if (queueState === "running") {
      const nextProgress =
        latest.progress > 0
          ? Math.min(0.92, latest.progress + (staleForMs >= 3000 ? 0.06 : 0))
          : 0.12;
      updateRenderJob(latest.id, {
        progress: nextProgress,
        statusMessage: latest.statusMessage ?? "Rendering on ComfyUI",
        lastHeartbeatAt: heartbeat,
      });
      return;
    }

    if (latest.progress < 0.92 && staleForMs >= 3000) {
      updateRenderJob(latest.id, {
        progress: Math.min(
          0.92,
          latest.progress + (latest.progress === 0 ? 0.12 : 0.06)
        ),
        statusMessage: latest.statusMessage ?? "Rendering on ComfyUI",
        lastHeartbeatAt: heartbeat,
      });
    }
  } catch {
    if (latest.progress < 0.92 && staleForMs >= 3000) {
      updateRenderJob(latest.id, {
        progress: Math.min(
          0.92,
          latest.progress + (latest.progress === 0 ? 0.12 : 0.06)
        ),
        statusMessage: latest.statusMessage ?? "Rendering on ComfyUI",
        lastHeartbeatAt: heartbeat,
      });
    }
  }
}

async function finalizeRenderJob(job: RenderJob): Promise<void> {
  if (!job.comfyuiPromptId) return;

  try {
    const history = await getHistory(
      job.comfyuiEndpointUrl,
      job.comfyuiPromptId
    );

    if (!history?.status?.completed) return;

    const outputs = extractOutputFiles(history);
    if (outputs.length === 0) {
      failRenderJob(job, "ComfyUI completed without output files");
      return;
    }

    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, job.projectId))
      .get();

    if (!project) {
      failRenderJob(job, "Project missing during finalize");
      return;
    }

    const dirs = ensureProjectDirs(project);
    const output = outputs[outputs.length - 1];
    const ext = path.extname(output.filename) || ".mp4";
    const fileName = `${job.shotId}-${nanoid(8)}${ext}`;
    const absoluteOutput = path.join(dirs.renders, fileName);

    await downloadOutput(job.comfyuiEndpointUrl, output, absoluteOutput);

    const frameSize = resolveOutputFrameSize(
      parseProjectRenderSettings(project.renderSettingsJson)
    );
    if (frameSize && isVideoRenderFile(absoluteOutput)) {
      await conformVideoToExactSize(
        absoluteOutput,
        frameSize.width,
        frameSize.height
      );
    }

    const projectRoot = resolveProjectRoot(project);
    const relativeOutput = path
      .relative(projectRoot, absoluteOutput)
      .replace(/\\/g, "/");
    const ts = now();

    updateRenderJob(job.id, {
      status: "completed",
      progress: 1,
      outputPath: relativeOutput,
      statusMessage: "Completed",
      completedAt: ts,
      lastHeartbeatAt: ts,
      errorMessage: null,
    });

    db.update(schema.shots)
      .set({
        videoPath: relativeOutput,
        renderStatus: "done",
        updatedAt: ts,
      })
      .where(eq(schema.shots.id, job.shotId))
      .run();

    activeBridges.get(job.id)?.disconnect();
    activeBridges.delete(job.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Render finalize failed";
    failRenderJob(job, message);
  }
}

async function processRenderJobs(): Promise<void> {
  const running = getRunningRenderJobs();
  await Promise.all(
    running.map(async (job) => {
      await pollRenderJobProgress(job);
      await finalizeRenderJob(job);
    })
  );

  const activeCount = getRunningRenderJobs().length;
  if (activeCount > 0) return;

  const next = getNextQueuedRenderJob();
  if (next) {
    await startRenderJob(next);
  }
}

function getNextQueuedExportJob(): ExportJob | null {
  const db = getDb();
  return (
    db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.status, "queued"))
      .all()
      .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null
  );
}

function getRunningExportJob(): ExportJob | null {
  const db = getDb();
  return (
    db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.status, "running"))
      .all()[0] ?? null
  );
}

async function processExportJobs(): Promise<void> {
  if (getRunningExportJob()) return;

  const job = getNextQueuedExportJob();
  if (!job) return;

  updateExportJob(job.id, {
    status: "running",
    progress: 0,
    progressMessage: "Queued for encoding…",
  });

  try {
    const settings = JSON.parse(job.settingsJson || "{}") as ExportSettings;
    const result = await runExport(
      job.projectId,
      { ...settings, exportJobId: job.id },
      (update) => {
        updateExportJob(job.id, {
          progress: update.progress,
          progressMessage: update.message,
          currentFrame: update.currentFrame ?? null,
          totalFrames: update.totalFrames ?? null,
          previewFramePath: update.previewFramePath ?? null,
        });
      }
    );
    const ts = now();

    updateExportJob(job.id, {
      status: "completed",
      progress: 1,
      outputPath: result.outputPath,
      outputMetaJson: JSON.stringify(result.meta),
      progressMessage: "Export complete",
      completedAt: ts,
      errorMessage: null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Export failed";
    updateExportJob(job.id, {
      status: "failed",
      progressMessage: "Export failed",
      errorMessage: message,
      completedAt: now(),
    });
  }
}

function failAssetOption(option: AssetGenerationOption, message: string): void {
  const ts = now();
  updateAssetOption(option.id, {
    status: "failed",
    errorMessage: formatComfyuiError(message),
    statusMessage: "Failed",
    completedAt: ts,
    lastHeartbeatAt: ts,
  });

  // Cascade the failure to queued stages that depend on this output (e.g. a
  // face detail pass waiting on its base render); otherwise they never run and
  // the batch never resolves.
  const db = getDb();
  const pending = [option.id];
  while (pending.length > 0) {
    const parentId = pending.pop()!;
    const dependents = db
      .select()
      .from(schema.assetGenerationOptions)
      .where(eq(schema.assetGenerationOptions.dependsOnOptionId, parentId))
      .all();
    for (const dependent of dependents) {
      if (dependent.status !== "queued") continue;
      updateAssetOption(dependent.id, {
        status: "failed",
        errorMessage: "Earlier pipeline stage failed",
        statusMessage: "Failed",
        completedAt: ts,
        lastHeartbeatAt: ts,
      });
      pending.push(dependent.id);
    }
  }

  activeAssetBridges.get(option.id)?.disconnect();
  activeAssetBridges.delete(option.id);
  refreshBatchStatus(option.batchId);
  maybeClearBatchAnchorUpload(option.batchId);
}

async function startAssetOption(option: AssetGenerationOption): Promise<void> {
  const db = getDb();
  const ts = now();

  const batchBeforeStart = db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, option.batchId))
    .get();
  if (batchBeforeStart?.status === "cancelled") {
    updateAssetOption(option.id, {
      status: "cancelled",
      completedAt: ts,
    });
    return;
  }

  const pipelineLabel = pipelineStageStatusLabel(option.pipelineStage);
  updateAssetOption(option.id, {
    status: "running",
    statusMessage:
      pipelineLabel ??
      (batchBeforeStart?.entityType === "location_angle"
        ? "Starting location reference generation"
        : batchBeforeStart?.entityType === "character_angle"
          ? "Starting character reference generation"
          : batchBeforeStart?.entityType === "shot"
            ? "Starting shot image generation"
            : "Starting character sheet generation"),
    lastHeartbeatAt: ts,
    progress: 0,
  });

  refreshBatchStatus(option.batchId);

  try {
    const batch = db
      .select()
      .from(schema.assetGenerationBatches)
      .where(eq(schema.assetGenerationBatches.id, option.batchId))
      .get();
    const project = batch
      ? db
          .select()
          .from(schema.projects)
          .where(eq(schema.projects.id, batch.projectId))
          .get()
      : null;

    if (!batch || !project) {
      throw new Error("Missing batch or project for asset option");
    }

    const workflowTemplateId = resolveAssetOptionTemplateId(batch, option);
    const template = db
      .select()
      .from(schema.workflowTemplates)
      .where(eq(schema.workflowTemplates.id, workflowTemplateId))
      .get();

    if (!template) {
      throw new Error("Missing workflow template for asset option");
    }

    const { renderSettings: baseRenderSettings } =
      await ensureProjectStillImageSettings(
        batch.projectId,
        batch.comfyuiEndpointUrl,
        { template }
      );

    let resolvedSettings = baseRenderSettings;
    if (LOCATION_ANCHOR_TEMPLATE_IDS.has(workflowTemplateId)) {
      const checkpoints = await getModels(batch.comfyuiEndpointUrl, "checkpoints");
      const ipCheckpoint = resolveCheckpointForIpAdapter(
        baseRenderSettings.checkpoint,
        checkpoints
      );
      if (ipCheckpoint.swapped) {
        resolvedSettings = withResolvedCheckpoint(
          baseRenderSettings,
          ipCheckpoint.checkpoint
        );
        updateAssetOption(option.id, {
          statusMessage: `IP-Adapter: using ${shortCheckpointLabel(ipCheckpoint.checkpoint)} instead of ${shortCheckpointLabel(ipCheckpoint.from ?? baseRenderSettings.checkpoint ?? "selected model")} (Illustrious-style checkpoints break reference-guided shots)`,
          lastHeartbeatAt: now(),
        });
      }
    }

    const projectRoot = resolveProjectRoot(project);
    let referenceImage: string | undefined;
    let secondaryReferenceImage: string | undefined;
    let characterIsolateImage: string | undefined;

    const needsAnchorImage = LOCATION_ANCHOR_TEMPLATE_IDS.has(workflowTemplateId);

    if (batch.entityType === "location_angle" && needsAnchorImage) {
      const uploads = await resolveBatchAnchorReferenceImages(batch, projectRoot);
      referenceImage = uploads.primary;
      secondaryReferenceImage = uploads.secondary;
      if (referenceImage || secondaryReferenceImage) {
        const usingIpAdapter =
          workflowTemplateId === BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID;
        updateAssetOption(option.id, {
          statusMessage: usingIpAdapter
            ? "Using establishing reference via IP-Adapter"
            : "Using establishing reference for img2img",
          lastHeartbeatAt: now(),
        });
      }
    } else if (batch.entityType === "character_angle" && needsAnchorImage) {
      const uploads = await resolveBatchAnchorReferenceImages(batch, projectRoot);
      referenceImage = uploads.primary;
      secondaryReferenceImage = uploads.secondary;
      if (referenceImage || secondaryReferenceImage) {
        const usingIpAdapter =
          workflowTemplateId === BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID;
        updateAssetOption(option.id, {
          statusMessage: usingIpAdapter
            ? "Using front reference via IP-Adapter"
            : "Using front reference for img2img",
          lastHeartbeatAt: now(),
        });
      }
    } else if (batch.entityType === "shot" && needsAnchorImage) {
      const uploads = await resolveShotOptionReferenceImages(
        batch,
        option,
        projectRoot
      );
      referenceImage = uploads.primary;
      secondaryReferenceImage = uploads.secondary;
      characterIsolateImage = uploads.isolate;
      if (referenceImage || secondaryReferenceImage) {
        const batchGenerationOptions = parseBatchGenerationOptions(
          batch.generationOptionsJson
        );
        const usingDualIpAdapter =
          workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID;
        const usingLocationPlate =
          workflowTemplateId === BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID;
        const usingSceneIntegrate =
          workflowTemplateId ===
          BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID;
        const usingCompositeInpaint =
          workflowTemplateId === BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID;
        const usingIpAdapter =
          usingDualIpAdapter ||
          usingLocationPlate ||
          usingSceneIntegrate ||
          option.pipelineStage === "character" ||
          workflowTemplateId === BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID;
        updateAssetOption(option.id, {
          statusMessage:
            pipelineLabel ??
            (usingDualIpAdapter
              ? "Using character and location references via dual IP-Adapter"
              : usingSceneIntegrate
                ? "Painting character into the location plate (masked inpaint)"
              : usingLocationPlate
                ? batchGenerationOptions.stillReferenceMode ===
                  "integrate_in_scene"
                  ? "Integrating character into location plate (single pass)"
                  : "Using location plate and character reference (composited)"
                : usingCompositeInpaint
                  ? "Pasting character on location plate, then integration pass"
                  : usingIpAdapter
                    ? "Using location or character reference via IP-Adapter"
                    : "Using reference media for img2img"),
          lastHeartbeatAt: now(),
        });
      }
    }

    if (
      workflowTemplateId === BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID &&
      batch.entityType === "location_angle" &&
      !referenceImage
    ) {
      throw new Error(
        "Establishing reference image missing on disk. Reselect the wide shot reference and try again."
      );
    }

    if (
      workflowTemplateId === BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID &&
      batch.entityType === "character_angle" &&
      !referenceImage
    ) {
      throw new Error(
        "Front reference image missing on disk. Reselect the front angle reference and try again."
      );
    }

    if (
      batch.entityType === "shot" &&
      workflowTemplateId === BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID &&
      (!referenceImage || !secondaryReferenceImage)
    ) {
      // The Qwen scene edit graph loads fixed input filenames. If either
      // upload is missing, ComfyUI would silently reuse whatever file was
      // uploaded last (possibly a different character or plate), so fail
      // loudly instead.
      throw new Error(
        !referenceImage
          ? "Character reference upload failed for scene edit. Check the character state reference image and try again."
          : "Location plate upload failed for scene edit. Check the location angle reference image and try again."
      );
    }

    if (
      batch.entityType === "shot" &&
      workflowTemplateId === BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID &&
      (!referenceImage || !characterIsolateImage)
    ) {
      // Same fixed-filename hazard as scene edit: never run the face pass
      // against a stale input image.
      throw new Error(
        !characterIsolateImage
          ? "Face detail pass could not load the finished render from the previous stage."
          : "Character reference upload failed for the face detail pass."
      );
    }

    if (
      batch.entityType === "shot" &&
      workflowTemplateId === BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID &&
      !secondaryReferenceImage
    ) {
      throw new Error(
        "Image edit source upload failed. The still being edited is missing on disk."
      );
    }

    if (
      batch.entityType === "shot" &&
      needsAnchorImage &&
      !referenceImage &&
      !secondaryReferenceImage
    ) {
      updateAssetOption(option.id, {
        statusMessage: "Reference image unavailable, generating from prompt only",
        lastHeartbeatAt: now(),
      });
    }

    if (
      workflowTemplateId === BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID
    ) {
      await assertComfyuiNodeClasses(batch.comfyuiEndpointUrl, [
        "IPAdapterModelLoader",
        "CLIPVisionLoader",
        "IPAdapterAdvanced",
      ]);
    }

    if (workflowTemplateId === BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID) {
      await assertComfyuiNodeClasses(
        batch.comfyuiEndpointUrl,
        [...COMPOSITING_NODE_CLASSES]
      );
    }

    if (
      workflowTemplateId === BUILTIN_SHOT_SCENE_EDIT_QWEN_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_IMAGE_EDIT_QWEN_TEMPLATE_ID
    ) {
      // Qwen Image Edit stack: core ComfyUI nodes, but assert so an outdated
      // ComfyUI fails with a clear message instead of a silent queue error.
      await assertComfyuiNodeClasses(batch.comfyuiEndpointUrl, [
        "UNETLoader",
        "TextEncodeQwenImageEditPlus",
        "ModelSamplingAuraFlow",
        "LoraLoaderModelOnly",
      ]);
    }

    if (workflowTemplateId === BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID) {
      // Face detail pass needs ComfyUI-Impact-Pack (FaceDetailer) plus
      // ComfyUI-Impact-Subpack (UltralyticsDetectorProvider) and the
      // IP-Adapter Plus nodes for likeness.
      await assertComfyuiNodeClasses(batch.comfyuiEndpointUrl, [
        "FaceDetailer",
        "UltralyticsDetectorProvider",
        "IPAdapterModelLoader",
        "CLIPVisionLoader",
        "IPAdapterAdvanced",
      ]);
    }

    if (
      workflowTemplateId === BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID
    ) {
      // Morning-tuned two-stage finish: masked paint, RemBG paste onto the
      // original plate, then diffusion harmonization (plain checkpoint). Paste
      // alone is never the final still.
      await assertComfyuiNodeClasses(batch.comfyuiEndpointUrl, [
        "SolidMask",
        "MaskComposite",
        "FeatherMask",
        "SetLatentNoiseMask",
        "RemBGSession+",
        "ImageRemoveBackground+",
        "GrowMask",
        "MaskBlur+",
        "ImageCompositeMasked",
        "IPAdapterModelLoader",
        "CLIPVisionLoader",
        "IPAdapterAdvanced",
      ]);
    }

    const shotPromptForComposition =
      batch.entityType === "shot"
        ? (getDb()
            .select({ prompt: schema.shots.prompt })
            .from(schema.shots)
            .where(eq(schema.shots.id, batch.entityId))
            .get()?.prompt?.trim() ??
          extractAnchoredViewDescription(batch.rawPrompt ?? ""))
        : "";

    const generationOptions = parseBatchGenerationOptions(
      batch.generationOptionsJson
    );

    const shotDualPaths =
      batch.entityType === "shot"
        ? resolveShotDualReferencePathsForBatch(batch)
        : { characterPath: null as string | null, locationPath: null as string | null };
    const singleShotReferenceFocus =
      generationOptions.referenceFocus ??
      (shotDualPaths.characterPath && !shotDualPaths.locationPath
        ? ("character" as const)
        : ("location" as const));

    const ipAdapterOverrides =
      generationOptions.ipAdapterWeight != null &&
      generationOptions.ipAdapterEndAt != null
        ? {
            weight: generationOptions.ipAdapterWeight,
            endAt: generationOptions.ipAdapterEndAt,
            ...(generationOptions.ipAdapterWeightType != null
              ? { weightType: generationOptions.ipAdapterWeightType }
              : {}),
          }
        : batch.entityType === "location_angle" &&
            workflowTemplateId ===
              BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID &&
            referenceImage
          ? getLocationIpAdapterProfile(
              resolveLocationAnchorReframeIntensity(batch.rawPrompt ?? "")
            )
          : undefined;

    const useDualIpAdapterProfiles =
      !ipAdapterOverrides &&
      batch.entityType === "shot" &&
      workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID &&
      Boolean(referenceImage && secondaryReferenceImage);

    const useDualIpAdapterBackdropProfiles =
      useDualIpAdapterProfiles && generationOptions.virtualBackdrop === true;

    const ipAdapterReframe =
      !ipAdapterOverrides &&
      !useDualIpAdapterProfiles &&
      !useDualIpAdapterBackdropProfiles &&
      option.pipelineStage === "character" &&
      referenceImage
        ? ("character_lock" as const)
        : !ipAdapterOverrides &&
            !useDualIpAdapterProfiles &&
            !useDualIpAdapterBackdropProfiles &&
            batch.entityType === "character_angle" &&
            workflowTemplateId ===
              BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID &&
            referenceImage
          ? resolveCharacterAnchorReframeIntensity(batch.rawPrompt ?? "")
          : !ipAdapterOverrides &&
              !useDualIpAdapterProfiles &&
              !useDualIpAdapterBackdropProfiles &&
              batch.entityType === "shot" &&
              workflowTemplateId ===
                BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID &&
              referenceImage
            ? resolveShotReframeIntensity(shotPromptForComposition, {
                referenceFocus: singleShotReferenceFocus,
              })
            : undefined;

    const detailMacro =
      batch.entityType === "shot" &&
      shouldUseMacroDetailLatent(shotPromptForComposition);

    const visualStyle = parseVisualStyle(project.visualStyleJson);
    const referenceDimensions =
      batch.entityType === "character_state" ||
      batch.entityType === "character_angle"
        ? generationOptions.frontBackDiptych
          ? resolveFrontBackDiptychDimensions(
              visualStyle,
              resolvedSettings.referenceAspectRatio as
                | ReferenceAspectRatioPreset
                | undefined
            )
          : resolveCharacterSheetReferenceDimensions(
              visualStyle,
              resolvedSettings.referenceAspectRatio as
                | ReferenceAspectRatioPreset
                | undefined
            )
        : undefined;

    let ipAdapterFilenames:
      | { ipadapter?: string; clipVision?: string }
      | undefined;
    if (
      workflowTemplateId === BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_LOCATION_PLATE_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_CHARACTER_ISOLATE_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_COMPOSITE_INPAINT_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID ||
      workflowTemplateId === BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID
    ) {
      const [ipadapterModels, clipVisionModels] = await Promise.all([
        getModels(batch.comfyuiEndpointUrl, "ipadapter").catch(
          () => [] as string[]
        ),
        getModels(batch.comfyuiEndpointUrl, "clip_vision").catch(
          () => [] as string[]
        ),
      ]);
      const ipadapter =
        workflowTemplateId === BUILTIN_SHOT_FACE_REFINE_TEMPLATE_ID
          ? resolveSdxlPlusFaceIpAdapterFilename(ipadapterModels)
          : resolveSdxlPlusIpAdapterFilename(ipadapterModels);
      const clipVision =
        clipVisionModels.find((name) =>
          name.toLowerCase().includes("vit.h.14")
        ) ?? CLIP_VISION_SDXL_FILENAME;
      if (ipadapter) {
        ipAdapterFilenames = { ipadapter, clipVision };
      }
    }

    // Integrate in scene: subject-region inpaint mask sized against the real
    // plate dimensions so the character renders at a controlled scale.
    let integrateSubjectMask:
      | ReturnType<typeof computeIntegrateSubjectMaskBox>
      | undefined;
    if (
      workflowTemplateId === BUILTIN_SHOT_SCENE_INTEGRATE_INPAINT_TEMPLATE_ID
    ) {
      let plateDimensions: { width: number; height: number } | null = null;
      if (shotDualPaths.locationPath) {
        const plateAbs = resolveMediaPath(
          projectRoot,
          shotDualPaths.locationPath
        );
        if (fs.existsSync(plateAbs)) {
          plateDimensions = readImageDimensions(plateAbs);
        }
      }
      integrateSubjectMask = computeIntegrateSubjectMaskBox({
        frameWidth: plateDimensions?.width ?? 1216,
        frameHeight: plateDimensions?.height ?? 832,
        heightFraction: generationOptions.integrateSubjectHeightFraction,
        anchorX: generationOptions.integrateSubjectAnchorX,
        groundY: generationOptions.integrateSubjectGroundY,
      });
    }

    let portraitPrompt = batch.processedPrompt;
    let negativePrompt = batch.negativePrompt ?? "";
    if (option.pipelineStage === "character") {
      portraitPrompt = buildCharacterIsolatePrompt(
        batch.entityId,
        shotPromptForComposition || batch.rawPrompt || ""
      );
      negativePrompt = buildCharacterIsolateNegative(negativePrompt);
    } else if (
      option.pipelineStage === "face_refine" &&
      batch.entityType === "shot"
    ) {
      portraitPrompt = buildFaceRefinePrompt(batch.entityId);
      negativePrompt =
        "blurry, low quality, deformed face, cross-eyed, extra eyes, oversharpened";
    }

    const { workflow, clientId } = buildPortraitPayload(
      template,
      JSON.parse(template.bindingsJson || "{}"),
      resolvedSettings,
      {
        prompt: portraitPrompt,
        negativePrompt,
        seed: option.seed,
        referenceImage,
        secondaryReferenceImage,
        characterIsolateImage,
      },
      {
        checkpoint: resolvedSettings.checkpoint,
        ipAdapterReframe,
        useDualIpAdapterProfiles:
          useDualIpAdapterProfiles && !useDualIpAdapterBackdropProfiles,
        useDualIpAdapterBackdropProfiles,
        ipAdapterOverrides,
        detailMacro,
        detailMacroWidth: SHOT_MACRO_LATENT_WIDTH,
        detailMacroHeight: SHOT_MACRO_LATENT_HEIGHT,
        referenceDimensions,
        ipAdapterFilenames,
        locationPlateDenoise: generationOptions.locationPlateDenoise,
        integrateSubjectMask,
        compositeInpaintDenoise: generationOptions.compositeInpaintDenoise,
        compositeBackgroundBlurRadius:
          generationOptions.compositeBackgroundBlurRadius,
        compositeBackgroundBlurSigma:
          generationOptions.compositeBackgroundBlurSigma,
        compositeCharacterWidth: generationOptions.compositeCharacterWidth,
        compositeCharacterHeight: generationOptions.compositeCharacterHeight,
        compositeCharacterX: generationOptions.compositeCharacterX,
        compositeCharacterY: generationOptions.compositeCharacterY,
        compositeMaskBlurAmount: generationOptions.compositeMaskBlurAmount,
        compositeColorMatchFactor: generationOptions.compositeColorMatchFactor,
      }
    );

    const promptRef = { id: null as string | null };

    const bridge = new ComfyUIWsBridge({
      baseUrl: batch.comfyuiEndpointUrl,
      clientId,
      onUpdate: (update) => {
        if (
          "promptId" in update &&
          update.promptId &&
          promptRef.id &&
          update.promptId !== promptRef.id
        ) {
          return;
        }

        const heartbeat = now();
        if (update.type === "executing") {
          const label = resolveComfyNodeLabel(option.pipelineStage, update.nodeId);
          updateAssetOption(option.id, {
            statusMessage:
              label ??
              (update.nodeId ? `Executing node ${update.nodeId}` : "Finalizing"),
            lastHeartbeatAt: heartbeat,
          });
        } else if (update.type === "progress") {
          const progress = update.max > 0 ? update.value / update.max : 0;
          updateAssetOption(option.id, {
            progress,
            statusMessage: `Progress ${update.value}/${update.max}`,
            lastHeartbeatAt: heartbeat,
          });
        } else if (update.type === "execution_error") {
          failAssetOption(option, update.message);
        }
      },
      onError: (error) => {
        updateAssetOption(option.id, {
          statusMessage: error.message,
          lastHeartbeatAt: now(),
        });
      },
    });

    activeAssetBridges.set(option.id, bridge);
    await bridge.connect();

    const queued = await queuePrompt(
      batch.comfyuiEndpointUrl,
      workflow,
      clientId
    );
    promptRef.id = queued.prompt_id;

    updateAssetOption(option.id, {
      comfyuiPromptId: queued.prompt_id,
      statusMessage: "Queued on ComfyUI",
      lastHeartbeatAt: now(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Asset generation start failed";
    failAssetOption(option, message);
  }
}

const ASSET_ORPHAN_PROMPT_GRACE_MS = 120_000;
const ASSET_COMPOSITE_STAGE_TIMEOUT_MS = 480_000;
const ASSET_DEFAULT_STAGE_TIMEOUT_MS = 900_000;

async function pollAssetOptionProgress(
  option: AssetGenerationOption,
  batch: typeof schema.assetGenerationBatches.$inferSelect
): Promise<void> {
  if (!option.comfyuiPromptId || option.status !== "running") return;

  const heartbeat = now();
  const lastHeartbeat = option.lastHeartbeatAt ?? option.createdAt;
  const staleForMs = heartbeat - lastHeartbeat;
  const stageTimeoutMs =
    option.pipelineStage === "composite"
      ? ASSET_COMPOSITE_STAGE_TIMEOUT_MS
      : ASSET_DEFAULT_STAGE_TIMEOUT_MS;

  try {
    const queue = await getQueue(batch.comfyuiEndpointUrl);
    const queueState = findPromptQueueState(queue, option.comfyuiPromptId);

    if (queueState === "absent") {
      const history = await getHistory(
        batch.comfyuiEndpointUrl,
        option.comfyuiPromptId
      );
      if (!history?.status?.completed && staleForMs >= ASSET_ORPHAN_PROMPT_GRACE_MS) {
        failAssetOption(
          option,
          "ComfyUI job did not finish (removed from queue or server restarted)"
        );
      }
      return;
    }

    if (queueState === "pending") {
      if (option.statusMessage !== "Waiting in ComfyUI queue") {
        updateAssetOption(option.id, {
          statusMessage: "Waiting in ComfyUI queue",
        });
      }
      return;
    }

    if (queueState === "running") {
      if (staleForMs >= stageTimeoutMs) {
        failAssetOption(
          option,
          `ComfyUI timed out after ${Math.round(stageTimeoutMs / 60_000)} minutes with no progress`
        );
        return;
      }

      const hasDetailedMessage =
        Boolean(option.statusMessage) &&
        option.statusMessage !== "Generating on ComfyUI" &&
        option.statusMessage !== "Running on ComfyUI (waiting for progress)";
      const wsRecentlyUpdated = staleForMs < 8000;
      const patch: {
        progress?: number;
        statusMessage?: string;
      } = {};

      if (
        option.progress < 0.92 &&
        !wsRecentlyUpdated &&
        option.progress < 0.85
      ) {
        patch.progress =
          option.progress > 0
            ? Math.min(0.92, option.progress + (staleForMs >= 5000 ? 0.02 : 0))
            : 0.08;
      }

      if (!hasDetailedMessage && !wsRecentlyUpdated) {
        patch.statusMessage = "Running on ComfyUI (waiting for progress)";
      }

      if (Object.keys(patch).length > 0) {
        updateAssetOption(option.id, patch);
      }
      return;
    }

    if (option.progress < 0.92 && staleForMs >= 5000 && staleForMs < 45000) {
      updateAssetOption(option.id, {
        progress: Math.min(0.92, option.progress + 0.02),
      });
    }
  } catch {
    if (option.progress < 0.92 && staleForMs >= 5000 && staleForMs < 45000) {
      updateAssetOption(option.id, {
        progress: Math.min(0.92, option.progress + 0.02),
      });
    }
  }
}

async function finalizeAssetOption(option: AssetGenerationOption): Promise<void> {
  if (!option.comfyuiPromptId) return;

  const db = getDb();
  const batch = db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, option.batchId))
    .get();

  if (!batch || batch.status === "cancelled") {
    activeAssetBridges.get(option.id)?.disconnect();
    activeAssetBridges.delete(option.id);
    return;
  }

  const latestOption = db
    .select()
    .from(schema.assetGenerationOptions)
    .where(eq(schema.assetGenerationOptions.id, option.id))
    .get();
  if (!latestOption || latestOption.status === "cancelled") {
    activeAssetBridges.get(option.id)?.disconnect();
    activeAssetBridges.delete(option.id);
    return;
  }

  try {
    await pollAssetOptionProgress(latestOption, batch);

    const history = await getHistory(
      batch.comfyuiEndpointUrl,
      latestOption.comfyuiPromptId!
    );

    if (!history?.status?.completed) return;

    const outputs = extractOutputFiles(history);
    if (outputs.length === 0) {
      failAssetOption(option, "ComfyUI completed without output files");
      return;
    }

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, batch.projectId))
      .get();

    if (!project) {
      failAssetOption(option, "Project missing during finalize");
      return;
    }

    const projectRoot = resolveProjectRoot(project);
    const output = outputs[outputs.length - 1];
    const relativePath =
      latestOption.pipelineStage === "character"
        ? getPipelineIsolateOutputPath(batch, option.id)
        : getCandidateOutputPath(batch, option.id);
    const absoluteOutput = path.join(projectRoot, relativePath);
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });

    await downloadOutput(batch.comfyuiEndpointUrl, output, absoluteOutput);

    const ts = now();
    updateAssetOption(option.id, {
      status: "completed",
      progress: 1,
      outputPath: relativePath.replace(/\\/g, "/"),
      statusMessage: "Completed",
      completedAt: ts,
      lastHeartbeatAt: ts,
      errorMessage: null,
    });

    activeAssetBridges.get(option.id)?.disconnect();
    activeAssetBridges.delete(option.id);
    refreshBatchStatus(option.batchId);
    maybeClearBatchAnchorUpload(option.batchId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Asset finalize failed";
    failAssetOption(option, message);
  }
}

async function processAssetGenerationJobs(): Promise<void> {
  const running = getRunningAssetOptions();
  await Promise.all(running.map((option) => finalizeAssetOption(option)));

  if (getRunningAssetOptions().length > 0) return;
  if (getRunningRenderJobs().length > 0) return;

  const next = getNextQueuedAssetOption();
  if (next) {
    await startAssetOption(next);
  }
}

async function tick(): Promise<void> {
  await processRenderJobs();
  await processAssetGenerationJobs();
  await processExportJobs();
}

async function main(): Promise<void> {
  if (!acquireWorkerLock()) {
    console.error(
      "[worker] Another DiffuseCut worker is already running. Exiting."
    );
    process.exit(0);
  }

  const releaseLock = () => releaseWorkerLock();
  process.on("SIGINT", releaseLock);
  process.on("SIGTERM", releaseLock);
  process.on("exit", releaseLock);

  const deps = await checkAllDependencies();
  console.log(`[worker] Dependencies: ${formatDependencySummary(deps)}`);

  getDb();
  console.log("[worker] Started, polling every 2s");

  await tick();
  setInterval(() => {
    tick().catch((error) => {
      console.error(
        "[worker] Tick error:",
        error instanceof Error ? error.message : error
      );
    });
  }, POLL_INTERVAL_MS);
}

main().catch((error) => {
  console.error(
    "[worker] Fatal:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
