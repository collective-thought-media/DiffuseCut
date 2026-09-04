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
import {
  CLIP_VISION_SDXL_FILENAME,
  resolveSdxlPlusIpAdapterFilename,
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
  uploadMedia,
  assertComfyuiNodeClasses,
  getModels,
} from "@/lib/services/comfyui-client";
import { resolveShotReferencePathForBatch, resolveShotDualReferencePathsForBatch } from "@/lib/services/shot-reference";
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
  resolveBatchContext,
} from "@/lib/services/asset-generation-queue";
import { buildPortraitPayload } from "@/lib/services/workflow-builder";
import {
  resolveLocationAnchorReframeIntensity,
  extractAnchoredViewDescription,
} from "@/lib/anchor-reframe";
import { resolveShotReframeIntensity } from "@/lib/services/prompt-preprocess";
import type { LocationReferenceGenerationOptions } from "@/types";
import {
  resolveLocationAnchorReferencePathForBatch,
} from "@/lib/services/location-asset-generation";
import {
  BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
} from "@/lib/db/seed-builtin-templates";
import { runExport, type ExportSettings } from "@/lib/services/ffmpeg-export";
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
import { hydrateProjectRenderSettings } from "@/lib/services/render-settings-resolver";
import { buildShotCharacterLookSuffix, resolveCharacterStateForCast } from "@/lib/services/character-states";
import { parseVisualStyle } from "@/lib/services/visual-style";
import {
  resolveCharacterSheetReferenceDimensions,
  type ReferenceAspectRatioPreset,
} from "@/lib/services/reference-aspect-ratio";
import type { RenderSettings } from "@/types";

const POLL_INTERVAL_MS = 2000;
const LOCATION_ANCHOR_TEMPLATE_IDS = new Set([
  BUILTIN_LOCATION_REFERENCE_IMG2IMG_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
  BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID,
]);
const activeBridges = new Map<string, ComfyUIWsBridge>();
const activeAssetBridges = new Map<string, ComfyUIWsBridge>();
type BatchAnchorUploads = { primary?: string; secondary?: string };
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
  } else if (batch.entityType === "shot") {
    if (batch.workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID) {
      const { characterPath, locationPath } =
        resolveShotDualReferencePathsForBatch(batch);
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
    } else {
      const anchorRelative = resolveShotReferencePathForBatch(batch);
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
    const styledShot = {
      ...shot,
      prompt: lookSuffix
        ? `${shot.prompt.trim()}, ${lookSuffix}`.trim()
        : shot.prompt,
    };
    const { renderSettings: resolvedSettings } =
      await hydrateProjectRenderSettings(job.projectId, {
        template,
        persist: true,
        updateAppDefaults: true,
      });
    const uploadedRefs = await collectUploadedRefs(job, job.comfyuiEndpointUrl);

    const fps = project.defaultFps ?? 24;

    const { workflow, clientId } = buildWorkflowPayload(
      template,
      JSON.parse(template.bindingsJson || "{}"),
      resolvedSettings,
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
    const outputPath = await runExport(
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
      outputPath,
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

  updateAssetOption(option.id, {
    status: "running",
    statusMessage:
      batchBeforeStart?.entityType === "location_angle"
        ? "Starting location reference generation"
        : batchBeforeStart?.entityType === "shot"
          ? "Starting shot image generation"
          : "Starting character sheet generation",
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
    const template = batch
      ? db
          .select()
          .from(schema.workflowTemplates)
          .where(eq(schema.workflowTemplates.id, batch.workflowTemplateId))
          .get()
      : null;
    const project = batch
      ? db
          .select()
          .from(schema.projects)
          .where(eq(schema.projects.id, batch.projectId))
          .get()
      : null;

    if (!batch || !template || !project) {
      throw new Error("Missing batch, template, or project for asset option");
    }

    const { renderSettings: baseRenderSettings } =
      await ensureProjectStillImageSettings(
        batch.projectId,
        batch.comfyuiEndpointUrl,
        { template }
      );

    let resolvedSettings = baseRenderSettings;
    if (LOCATION_ANCHOR_TEMPLATE_IDS.has(batch.workflowTemplateId)) {
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

    const needsAnchorImage = LOCATION_ANCHOR_TEMPLATE_IDS.has(
      batch.workflowTemplateId
    );

    if (
      (batch.entityType === "location_angle" ||
        batch.entityType === "shot") &&
      needsAnchorImage
    ) {
      const uploads = await resolveBatchAnchorReferenceImages(batch, projectRoot);
      referenceImage = uploads.primary;
      secondaryReferenceImage = uploads.secondary;
      if (referenceImage || secondaryReferenceImage) {
        const usingDualIpAdapter =
          batch.workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID;
        const usingIpAdapter =
          usingDualIpAdapter ||
          batch.workflowTemplateId ===
            BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID;
        updateAssetOption(option.id, {
          statusMessage:
            batch.entityType === "shot"
              ? usingDualIpAdapter
                ? "Using character and location references via dual IP-Adapter"
                : usingIpAdapter
                  ? "Using location or character reference via IP-Adapter"
                  : "Using reference media for img2img"
              : usingIpAdapter
                ? "Using establishing reference via IP-Adapter"
                : "Using establishing reference for img2img",
          lastHeartbeatAt: now(),
        });
      }
    }

    if (
      LOCATION_ANCHOR_TEMPLATE_IDS.has(batch.workflowTemplateId) &&
      batch.entityType === "location_angle" &&
      !referenceImage
    ) {
      throw new Error(
        "Establishing reference image missing on disk. Reselect the wide shot reference and try again."
      );
    }

    if (
      batch.entityType === "shot" &&
      LOCATION_ANCHOR_TEMPLATE_IDS.has(batch.workflowTemplateId) &&
      !referenceImage &&
      !secondaryReferenceImage
    ) {
      updateAssetOption(option.id, {
        statusMessage: "Reference image unavailable, generating from prompt only",
        lastHeartbeatAt: now(),
      });
    }

    if (
      batch.workflowTemplateId ===
        BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID ||
      batch.workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID
    ) {
      await assertComfyuiNodeClasses(batch.comfyuiEndpointUrl, [
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
          }
        : undefined;

    const useDualIpAdapterProfiles =
      !ipAdapterOverrides &&
      batch.entityType === "shot" &&
      batch.workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID &&
      referenceImage &&
      secondaryReferenceImage;

    const useDualIpAdapterBackdropProfiles =
      useDualIpAdapterProfiles && generationOptions.virtualBackdrop === true;

    const ipAdapterReframe =
      !ipAdapterOverrides &&
      !useDualIpAdapterProfiles &&
      !useDualIpAdapterBackdropProfiles &&
      batch.entityType === "location_angle" &&
      batch.workflowTemplateId ===
        BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID &&
      referenceImage
        ? resolveLocationAnchorReframeIntensity(batch.rawPrompt ?? "")
        : !ipAdapterOverrides &&
            !useDualIpAdapterProfiles &&
            !useDualIpAdapterBackdropProfiles &&
            batch.entityType === "shot" &&
            batch.workflowTemplateId ===
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
      batch.entityType === "character_state"
        ? resolveCharacterSheetReferenceDimensions(
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
      batch.workflowTemplateId ===
        BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID ||
      batch.workflowTemplateId === BUILTIN_SHOT_DUAL_IPADAPTER_TEMPLATE_ID
    ) {
      const [ipadapterModels, clipVisionModels] = await Promise.all([
        getModels(batch.comfyuiEndpointUrl, "ipadapter").catch(
          () => [] as string[]
        ),
        getModels(batch.comfyuiEndpointUrl, "clip_vision").catch(
          () => [] as string[]
        ),
      ]);
      const ipadapter = resolveSdxlPlusIpAdapterFilename(ipadapterModels);
      const clipVision =
        clipVisionModels.find((name) =>
          name.toLowerCase().includes("vit.h.14")
        ) ?? CLIP_VISION_SDXL_FILENAME;
      if (ipadapter) {
        ipAdapterFilenames = { ipadapter, clipVision };
      }
    }

    const { workflow, clientId } = buildPortraitPayload(
      template,
      JSON.parse(template.bindingsJson || "{}"),
      resolvedSettings,
      {
        prompt: batch.processedPrompt,
        negativePrompt: batch.negativePrompt,
        seed: option.seed,
        referenceImage,
        secondaryReferenceImage,
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
          updateAssetOption(option.id, {
            statusMessage: update.nodeId
              ? `Executing node ${update.nodeId}`
              : "Finalizing",
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

async function pollAssetOptionProgress(
  option: AssetGenerationOption,
  batch: typeof schema.assetGenerationBatches.$inferSelect
): Promise<void> {
  if (!option.comfyuiPromptId || option.status !== "running") return;

  const heartbeat = now();
  const lastHeartbeat = option.lastHeartbeatAt ?? option.createdAt;
  const staleForMs = heartbeat - lastHeartbeat;

  try {
    const queue = await getQueue(batch.comfyuiEndpointUrl);
    const queueState = findPromptQueueState(queue, option.comfyuiPromptId);

    if (queueState === "pending") {
      updateAssetOption(option.id, {
        statusMessage: "Waiting in ComfyUI queue",
        lastHeartbeatAt: heartbeat,
      });
      return;
    }

    if (queueState === "running") {
      const nextProgress =
        option.progress > 0
          ? Math.min(0.92, option.progress + (staleForMs >= 3000 ? 0.06 : 0))
          : 0.12;
      updateAssetOption(option.id, {
        progress: nextProgress,
        statusMessage: "Generating on ComfyUI",
        lastHeartbeatAt: heartbeat,
      });
      return;
    }

    if (option.progress < 0.92 && staleForMs >= 3000) {
      updateAssetOption(option.id, {
        progress: Math.min(0.92, option.progress + 0.06),
        statusMessage: option.statusMessage ?? "Generating on ComfyUI",
        lastHeartbeatAt: heartbeat,
      });
    }
  } catch {
    if (option.progress < 0.92 && staleForMs >= 3000) {
      updateAssetOption(option.id, {
        progress: Math.min(0.92, option.progress + 0.06),
        statusMessage: option.statusMessage ?? "Generating on ComfyUI",
        lastHeartbeatAt: heartbeat,
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
    const relativePath = getCandidateOutputPath(batch, option.id);
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
