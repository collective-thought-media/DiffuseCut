import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { HttpError } from "@/lib/api-helpers";
import {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID,
} from "@/lib/db/seed-builtin-templates";
import type {
  AssetGenerationBatch,
  Character,
} from "@/lib/db/schema";
import {
  resolveMediaPath,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import { assertDependency } from "@/lib/services/dependency-checker";
import {
  buildCharacterAngleReferenceDescription,
  getCharacterAngle,
  listCharacterStates,
  resolveCharacterAnchorReferencePath,
  syncCharacterReferenceFromState,
} from "@/lib/services/character-states";
import {
  buildAnchoredCharacterAngleReferenceDescription,
  resolveCharacterBackAngleId,
  shouldGenerateFrontBackDiptych,
} from "@/lib/character-preview";
import { detectCharacterRearView } from "@/lib/anchor-reframe";
import { buildCharacterSheetPrompts } from "@/lib/services/prompt-preprocess";
import { cropAndPadImagePanel, cropImagePanel } from "@/lib/services/image-panel-crop";
import {
  resolveCharacterSheetReferenceDimensions,
  type ReferenceAspectRatioPreset,
} from "@/lib/services/reference-aspect-ratio";
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

async function resolveCharacterSheetTemplateId(
  projectId: string
): Promise<string> {
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
  return BUILTIN_CHARACTER_SHEET_TEMPLATE_ID;
}

export async function resolveCharacterReferenceTemplateId(
  projectId: string,
  options?: { anchorReferencePath?: string | null; endpointUrl?: string }
): Promise<string> {
  if (options?.anchorReferencePath) {
    const endpointUrl =
      options.endpointUrl ?? (await resolveProjectEndpointUrl(projectId));
    if (await isIpAdapterAvailable(endpointUrl)) {
      return BUILTIN_LOCATION_REFERENCE_IPADAPTER_TEMPLATE_ID;
    }
    return resolveCharacterSheetTemplateId(projectId);
  }

  return resolveCharacterSheetTemplateId(projectId);
}

export function getActiveBatchForCharacterAngle(
  angleId: string
): AssetGenerationBatch | null {
  return getActiveBatchForEntity("character_angle", angleId);
}

export function getDisplayBatchForCharacterAngle(
  angleId: string
): AssetGenerationBatch | null {
  return getDisplayBatchForEntity("character_angle", angleId);
}

export type CharacterReferencePack = AssetGenerationPack;

export function listCharacterReferencePacks(
  angleId: string
): CharacterReferencePack[] {
  return listAssetGenerationPacks("character_angle", angleId, () =>
    getDisplayBatchForCharacterAngle(angleId)
  );
}

export function getCharacterReferenceBatchView(
  angleId: string,
  batchId?: string | null
) {
  return getAssetGenerationBatchView(
    "character_angle",
    angleId,
    () => getDisplayBatchForCharacterAngle(angleId),
    batchId
  );
}

export function supersedeCharacterReferenceBatch(
  projectId: string,
  characterId: string,
  stateId: string,
  angleId: string,
  priorBatch: AssetGenerationBatch
): void {
  supersedeAssetGenerationBatch(priorBatch, (batch) =>
    discardCharacterReferenceBatch(
      projectId,
      characterId,
      stateId,
      angleId,
      batch
    )
  );
}

export function discardCharacterReferenceBatch(
  projectId: string,
  characterId: string,
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
      batchOverride ?? getDisplayBatchForCharacterAngle(angleId) ?? undefined;
  }
  if (!batch) {
    throw new Error("No character reference batch to discard");
  }
  if (batch.projectId !== projectId) {
    throw new Error("Batch does not belong to this project");
  }
  if (batch.entityType !== "character_angle" || batch.entityId !== angleId) {
    throw new Error("Batch does not belong to this character angle");
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
    "characters",
    characterId,
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

export async function enqueueCharacterAngleReferenceBatch(
  projectId: string,
  characterId: string,
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

  const state = db
    .select()
    .from(schema.characterStates)
    .where(eq(schema.characterStates.id, stateId))
    .get();
  if (!state || state.characterId !== characterId) {
    throw new Error("Character state not found");
  }

  const angle = getCharacterAngle(projectId, characterId, stateId, angleId);
  if (!angle) throw new Error("Character angle not found");

  const priorBatch =
    getActiveBatchForCharacterAngle(angleId) ??
    (options?.replace ? getDisplayBatchForCharacterAngle(angleId) : null);
  if (
    priorBatch &&
    !options?.replace &&
    (priorBatch.status === "queued" || priorBatch.status === "running")
  ) {
    throw new HttpError(
      "A character reference batch is already in progress. Discard it first or regenerate.",
      409
    );
  }
  const priorBatchForSupersede =
    options?.replace && priorBatch
      ? priorBatch
      : options?.replace
        ? getDisplayBatchForCharacterAngle(angleId)
        : null;

  const stateWithAngles = listCharacterStates(characterId).find(
    (item) => item.id === stateId
  );
  const frontBackDiptych =
    options?.generationOptions?.frontBackDiptych === true ||
    (stateWithAngles
      ? shouldGenerateFrontBackDiptych(stateWithAngles, angleId)
      : false);
  const anchorReferencePath = stateWithAngles
    ? resolveCharacterAnchorReferencePath(stateWithAngles, angleId)
    : null;
  const anchorMode = Boolean(anchorReferencePath) && !frontBackDiptych;

  let referenceDescription = anchorMode
    ? buildAnchoredCharacterAngleReferenceDescription(
        character.description,
        state,
        angle
      )
    : buildCharacterAngleReferenceDescription(
        character.description,
        state,
        angle
      );

  if (frontBackDiptych && stateWithAngles) {
    const backAngleId = resolveCharacterBackAngleId(stateWithAngles, angleId);
    const backAngle = stateWithAngles.angles.find((a) => a.id === backAngleId);
    const parts = [
      character.description.trim(),
      state.lookDescription.trim(),
      angle.viewDescription.trim(),
      backAngle?.viewDescription.trim()
        ? `Back view: ${backAngle.viewDescription.trim()}`
        : "",
    ].filter(Boolean);
    referenceDescription = parts.join(". ");
  }
  if (!referenceDescription.trim()) {
    throw new Error(
      "Add a character description, state look, or angle view description first"
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

  const generationOptions = options?.generationOptions ?? {};
  const rearView = detectCharacterRearView(angle.viewDescription.trim());
  const explicitCustomIp =
    generationOptions.useIpAdapter === true &&
    generationOptions.ipAdapterWeight != null &&
    generationOptions.ipAdapterEndAt != null;
  let useIpAdapter = generationOptions.useIpAdapter !== false;
  if (rearView && anchorMode && !explicitCustomIp) {
    useIpAdapter = false;
  }

  const templateId = useIpAdapter
    ? await resolveCharacterReferenceTemplateId(projectId, {
        anchorReferencePath,
        endpointUrl,
      })
    : await resolveCharacterSheetTemplateId(projectId);
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
    throw new Error("Invalid character reference workflow template");
  }

  await ensureProjectStillImageSettings(projectId, endpointUrl, { templateId });

  const visualStyle = parseVisualStyle(project.visualStyleJson);
  const angleLabel = `${character.name} (${angle.name})`;
  const { processedPrompt, negativePrompt } = await buildCharacterSheetPrompts(
    angleLabel,
    referenceDescription,
    visualStyle,
    {
      anchorMode: anchorMode && useIpAdapter,
      viewDescription: angle.viewDescription.trim() || undefined,
      frontBackDiptych,
    }
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
    entityType: "character_angle",
    entityId: angleId,
    workflowTemplateId: templateId,
    comfyuiEndpointUrl: endpointUrl,
    status: "queued",
    sampleCount: count,
    rawPrompt: referenceDescription,
    processedPrompt,
    negativePrompt: finalNegativePrompt,
    generationOptionsJson: JSON.stringify({
      ...generationOptions,
      useIpAdapter,
      frontBackDiptych,
    }),
    createdAt: ts,
  };

  db.insert(schema.assetGenerationBatches).values(batch).run();

  const candidateDir = path.join(
    resolveProjectRoot(project),
    "characters",
    characterId,
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

  if (priorBatchForSupersede) {
    supersedeCharacterReferenceBatch(
      projectId,
      characterId,
      stateId,
      angleId,
      priorBatchForSupersede
    );
  }

  return db
    .select()
    .from(schema.assetGenerationBatches)
    .where(eq(schema.assetGenerationBatches.id, batchId))
    .get()!;
}

export type CharacterReferencePanelSelection =
  | "full"
  | "left"
  | "right";

export type CharacterReferenceSelectOptions = {
  panel?: CharacterReferencePanelSelection;
  /** When set, left panel saves to front angle and right panel to back angle. */
  splitPair?: { frontAngleId: string; backAngleId: string };
};

async function writeAngleReferenceImageAsync(
  projectRoot: string,
  characterId: string,
  stateId: string,
  angleId: string,
  sourceAbs: string,
  panel: CharacterReferencePanelSelection,
  panelTarget?: { width: number; height: number }
): Promise<string> {
  const ext = path.extname(sourceAbs) || ".png";
  const destRelative = `characters/${characterId}/states/${stateId}/angles/${angleId}/reference${ext}`;
  const destAbs = path.join(projectRoot, destRelative);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });

  if (panel === "full") {
    fs.copyFileSync(sourceAbs, destAbs);
  } else if (panelTarget) {
    await cropAndPadImagePanel(
      sourceAbs,
      destAbs,
      panel,
      panelTarget.width,
      panelTarget.height
    );
  } else {
    await cropImagePanel(sourceAbs, destAbs, panel);
  }

  return destRelative.replace(/\\/g, "/");
}

function markAngleReferenceSaved(
  angleId: string,
  destRelative: string
): void {
  const db = getDb();
  const ts = Date.now();
  db.update(schema.characterAngles)
    .set({
      referencePath: destRelative,
      referenceKind: "image",
      referenceSource: "comfyui",
      updatedAt: ts,
    })
    .where(eq(schema.characterAngles.id, angleId))
    .run();
}

export async function selectCharacterAngleReferenceOption(
  projectId: string,
  characterId: string,
  stateId: string,
  angleId: string,
  optionId: string,
  selectOptions?: CharacterReferenceSelectOptions
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

  const angle = getCharacterAngle(projectId, characterId, stateId, angleId);
  if (!angle) throw new Error("Character angle not found");

  if (
    !batch ||
    batch.projectId !== projectId ||
    batch.entityType !== "character_angle"
  ) {
    throw new Error("Option does not belong to this character angle");
  }

  const batchAngle = getCharacterAngle(
    projectId,
    characterId,
    stateId,
    batch.entityId
  );
  if (!batchAngle) {
    throw new Error("Option does not belong to this character state");
  }

  if (!selectOptions?.splitPair && batch.entityId !== angleId) {
    throw new Error("Option does not belong to this character angle");
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

  const renderSettings = JSON.parse(
    project.renderSettingsJson || "{}"
  ) as { referenceAspectRatio?: ReferenceAspectRatioPreset };
  const visualStyle = parseVisualStyle(project.visualStyleJson);
  const panelTarget = resolveCharacterSheetReferenceDimensions(
    visualStyle,
    renderSettings.referenceAspectRatio
  );

  if (selectOptions?.splitPair) {
    const { frontAngleId, backAngleId } = selectOptions.splitPair;
    const frontAngle = getCharacterAngle(
      projectId,
      characterId,
      stateId,
      frontAngleId
    );
    const backAngle = getCharacterAngle(
      projectId,
      characterId,
      stateId,
      backAngleId
    );
    if (!frontAngle || !backAngle) {
      throw new Error("Front or back angle not found for split");
    }

    const frontPath = await writeAngleReferenceImageAsync(
      projectRoot,
      characterId,
      stateId,
      frontAngleId,
      sourceAbs,
      "left",
      panelTarget
    );
    const backPath = await writeAngleReferenceImageAsync(
      projectRoot,
      characterId,
      stateId,
      backAngleId,
      sourceAbs,
      "right",
      panelTarget
    );
    markAngleReferenceSaved(frontAngleId, frontPath);
    markAngleReferenceSaved(backAngleId, backPath);
  } else {
    const panel = selectOptions?.panel ?? "full";
    const destRelative = await writeAngleReferenceImageAsync(
      projectRoot,
      characterId,
      stateId,
      angleId,
      sourceAbs,
      panel,
      panel === "full" ? undefined : panelTarget
    );
    markAngleReferenceSaved(angleId, destRelative);
  }

  const states = listCharacterStates(characterId);
  const currentState = states.find((item) => item.id === stateId);
  if (currentState) {
    syncCharacterReferenceFromState(characterId, currentState, projectRoot);
  }

  const updated = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId))
    .get()!;

  archiveBatchAfterReferenceSelection(batch.id, optionId);

  return updated;
}

export function resolveCharacterAngleBatchContext(batch: AssetGenerationBatch): {
  characterId: string;
  stateId: string;
  angleId: string;
} {
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
    characterId: state.characterId,
    stateId: state.id,
    angleId: angle.id,
  };
}

export function resolveCharacterAnchorReferencePathForBatch(
  batch: AssetGenerationBatch
): string | null {
  if (batch.entityType !== "character_angle") return null;

  const { characterId, stateId, angleId } =
    resolveCharacterAngleBatchContext(batch);
  const stateWithAngles = listCharacterStates(characterId).find(
    (item) => item.id === stateId
  );
  if (!stateWithAngles) return null;

  return resolveCharacterAnchorReferencePath(stateWithAngles, angleId);
}

export function getCharacterCandidateOutputPath(
  characterId: string,
  stateId: string,
  angleId: string,
  batchId: string,
  optionId: string
): string {
  return `characters/${characterId}/states/${stateId}/angles/${angleId}/candidates/${batchId}/${optionId}.png`;
}
