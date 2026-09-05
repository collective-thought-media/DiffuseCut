import fs from "fs";
import path from "path";
import { and, asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { HttpError } from "@/lib/api-helpers";
import {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
} from "@/lib/db/seed-builtin-templates";
import type {
  AssetGenerationBatch,
  AssetGenerationOption,
  Location,
} from "@/lib/db/schema";
import {
  resolveMediaPath,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import { assertDependency } from "@/lib/services/dependency-checker";
import {
  buildAngleReferenceDescription,
  getLocationAngle,
  listLocationStates,
  resolveLocationAnchorReferencePath,
  syncLocationReferenceFromState,
} from "@/lib/services/location-states";
import { buildAnchoredAngleReferenceDescription } from "@/lib/location-preview";
import { buildLocationReferencePrompts } from "@/lib/services/prompt-preprocess";
import { parseVisualStyle } from "@/lib/services/visual-style";
import { ensureProjectStillImageSettings, resolveProjectEndpointUrl } from "@/lib/services/generation-stack";
import { mergeImageNegativePrompt } from "@/lib/services/image-generation-overrides";
import {
  isIpAdapterAvailable,
  listEndpoints,
} from "@/lib/services/comfyui-client";
import {
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";
import type { LocationReferenceGenerationOptions, RenderSettings } from "@/types";
import {
  getActiveBatchForEntity,
  getDisplayBatchForEntity,
  getBatchWithOptions,
  updateAssetBatch,
  archiveBatchAfterReferenceSelection,
} from "@/lib/services/asset-generation-queue";
import {
  getAssetGenerationBatchView,
  listAssetGenerationPacks,
  supersedeAssetGenerationBatch,
  type AssetGenerationPack,
} from "@/lib/services/asset-generation-packs";

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

function resolveLocationTxt2imgTemplateId(
  project: { renderSettingsJson: string | null }
): string {
  const renderSettings = JSON.parse(
    project.renderSettingsJson || "{}"
  ) as RenderSettings;
  if (renderSettings.locationSheetTemplateId) {
    return renderSettings.locationSheetTemplateId;
  }
  if (renderSettings.characterSheetTemplateId) {
    return renderSettings.characterSheetTemplateId;
  }
  return BUILTIN_CHARACTER_SHEET_TEMPLATE_ID;
}

export async function resolveLocationReferenceTemplateId(
  projectId: string,
  options?: { anchorReferencePath?: string | null; endpointUrl?: string }
): Promise<string> {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) throw new Error("Project not found");

  if (options?.anchorReferencePath) {
    const endpointUrl =
      options.endpointUrl ?? (await resolveProjectEndpointUrl(projectId));
    if (await isIpAdapterAvailable(endpointUrl)) {
      return BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID;
    }
    // img2img encodes the wide shot into the latent and cannot produce a new
    // camera angle (85mm close-up, overhead, etc.). Fall back to txt2img so the
    // angle description drives composition; install IP-Adapter for set matching.
    return resolveLocationTxt2imgTemplateId(project);
  }

  return resolveLocationTxt2imgTemplateId(project);
}

export function getActiveBatchForLocationAngle(
  angleId: string
): AssetGenerationBatch | null {
  return getActiveBatchForEntity("location_angle", angleId);
}

export function getDisplayBatchForLocationAngle(
  angleId: string
): AssetGenerationBatch | null {
  return getDisplayBatchForEntity("location_angle", angleId);
}

export type LocationReferencePack = AssetGenerationPack;

export function listLocationReferencePacks(
  angleId: string
): LocationReferencePack[] {
  return listAssetGenerationPacks("location_angle", angleId, () =>
    getDisplayBatchForLocationAngle(angleId)
  );
}

export function getLocationReferenceBatchView(
  angleId: string,
  batchId?: string | null
) {
  return getAssetGenerationBatchView(
    "location_angle",
    angleId,
    () => getDisplayBatchForLocationAngle(angleId),
    batchId
  );
}

export function supersedeLocationReferenceBatch(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string,
  priorBatch: AssetGenerationBatch
): void {
  supersedeAssetGenerationBatch(priorBatch, (batch) =>
    discardLocationReferenceBatch(
      projectId,
      locationId,
      stateId,
      angleId,
      batch
    )
  );
}

export function discardLocationReferenceBatch(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string,
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
    batch =
      batchOverride ?? getDisplayBatchForLocationAngle(angleId) ?? undefined;
  }
  if (!batch) {
    throw new Error("No location reference batch to discard");
  }
  if (batch.projectId !== projectId) {
    throw new Error("Batch does not belong to this project");
  }
  if (batch.entityType !== "location_angle" || batch.entityId !== angleId) {
    throw new Error("Batch does not belong to this location angle");
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
    "locations",
    locationId,
    "states",
    stateId,
    "angles",
    angleId,
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

export async function enqueueLocationReferenceBatch(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string,
  sampleCount: number,
  options?: {
    replace?: boolean;
    generationOptions?: LocationReferenceGenerationOptions;
    extraNegativePrompt?: string;
  }
): Promise<AssetGenerationBatch> {
  await assertDependency("comfyui");

  const count = Math.min(4, Math.max(2, sampleCount));
  const db = getDb();

  const location = db
    .select()
    .from(schema.locations)
    .where(
      and(
        eq(schema.locations.id, locationId),
        eq(schema.locations.projectId, projectId)
      )
    )
    .get();
  if (!location) throw new Error("Location not found");

  const state = db
    .select()
    .from(schema.locationStates)
    .where(eq(schema.locationStates.id, stateId))
    .get();
  if (!state || state.locationId !== locationId) {
    throw new Error("Location state not found");
  }

  const angle = getLocationAngle(projectId, locationId, stateId, angleId);
  if (!angle) throw new Error("Location angle not found");

  const priorBatch =
    getActiveBatchForLocationAngle(angleId) ??
    (options?.replace ? getDisplayBatchForLocationAngle(angleId) : null);
  if (priorBatch && !options?.replace) {
    throw new HttpError(
      "A location reference batch is already in progress. Discard it first or regenerate.",
      409
    );
  }

  const stateWithAngles = listLocationStates(locationId).find(
    (item) => item.id === stateId
  );
  const anchorReferencePath = stateWithAngles
    ? resolveLocationAnchorReferencePath(stateWithAngles, angleId)
    : null;
  const anchorMode = Boolean(anchorReferencePath);

  const referenceDescription = anchorMode
    ? buildAnchoredAngleReferenceDescription(
        location.description,
        state,
        angle
      )
    : buildAngleReferenceDescription(location.description, state, angle);
  if (!referenceDescription.trim()) {
    throw new Error(
      "Add a location description, state look, or angle view description first"
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

  const generationOptions = options?.generationOptions;
  const useIpAdapter = generationOptions?.useIpAdapter !== false;

  const templateId = useIpAdapter
    ? await resolveLocationReferenceTemplateId(projectId, {
        anchorReferencePath,
        endpointUrl,
      })
    : resolveLocationTxt2imgTemplateId(project);
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
    throw new Error("Invalid location reference workflow template");
  }

  await ensureProjectStillImageSettings(projectId, endpointUrl, { templateId });

  const visualStyle = parseVisualStyle(project.visualStyleJson);
  const anchorOptions = {
    anchorMode,
    viewDescription: angle.viewDescription.trim(),
  };
  const angleLabel = `${location.name} (${angle.name})`;
  const { processedPrompt, negativePrompt } = await buildLocationReferencePrompts(
    angleLabel,
    referenceDescription,
    visualStyle,
    anchorOptions
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
    entityType: "location_angle",
    entityId: angleId,
    workflowTemplateId: templateId,
    comfyuiEndpointUrl: endpointUrl,
    status: "queued",
    sampleCount: count,
    rawPrompt: referenceDescription,
    processedPrompt,
    negativePrompt: finalNegativePrompt,
    generationOptionsJson: generationOptions
      ? JSON.stringify(generationOptions)
      : null,
    createdAt: ts,
  };

  db.insert(schema.assetGenerationBatches).values(batch).run();

  const candidateDir = path.join(
    resolveProjectRoot(project),
    "locations",
    locationId,
    "states",
    stateId,
    "angles",
    angleId,
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
    supersedeLocationReferenceBatch(
      projectId,
      locationId,
      stateId,
      angleId,
      priorBatch
    );
  }

  return db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, batchId))
    .get()!;
}

export async function selectLocationReferenceOption(
  projectId: string,
  locationId: string,
  stateId: string,
  angleId: string,
  optionId: string
): Promise<Location> {
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

  const angle = getLocationAngle(projectId, locationId, stateId, angleId);
  if (!angle) throw new Error("Location angle not found");

  if (
    !batch ||
    batch.projectId !== projectId ||
    batch.entityType !== "location_angle" ||
    batch.entityId !== angleId
  ) {
    throw new Error("Option does not belong to this location angle");
  }

  const location = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId))
    .get();
  if (!location) throw new Error("Location not found");

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
  const destRelative = `locations/${locationId}/states/${stateId}/angles/${angleId}/reference${ext}`;
  const destAbs = path.join(projectRoot, destRelative);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(sourceAbs, destAbs);

  const ts = Date.now();
  db.update(schema.locationAngles)
    .set({
      referencePath: destRelative.replace(/\\/g, "/"),
      referenceKind: "image",
      referenceSource: "comfyui",
      updatedAt: ts,
    })
    .where(eq(schema.locationAngles.id, angleId))
    .run();

  const states = listLocationStates(locationId);
  const currentState = states.find((item) => item.id === stateId);
  if (currentState) {
    syncLocationReferenceFromState(locationId, currentState, projectRoot);
  }

  const updated = db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId))
    .get()!;

  archiveBatchAfterReferenceSelection(batch.id, optionId);

  return updated;
}

export function resolveLocationAngleBatchContext(batch: AssetGenerationBatch): {
  locationId: string;
  stateId: string;
  angleId: string;
} {
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
    locationId: state.locationId,
    stateId: state.id,
    angleId: angle.id,
  };
}

export function resolveLocationAnchorReferencePathForBatch(
  batch: AssetGenerationBatch
): string | null {
  if (batch.entityType !== "location_angle") return null;

  const { locationId, stateId, angleId } =
    resolveLocationAngleBatchContext(batch);
  const stateWithAngles = listLocationStates(locationId).find(
    (item) => item.id === stateId
  );
  if (!stateWithAngles) return null;

  return resolveLocationAnchorReferencePath(stateWithAngles, angleId);
}

export function getLocationCandidateOutputPath(
  locationId: string,
  stateId: string,
  angleId: string,
  batchId: string,
  optionId: string
): string {
  return `locations/${locationId}/states/${stateId}/angles/${angleId}/candidates/${batchId}/${optionId}.png`;
}
