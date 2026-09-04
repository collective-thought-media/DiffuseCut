import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  BUILTIN_KREA2_STILL_TEMPLATE_ID,
  resolveDefaultCharacterSheetTemplateId,
} from "@/lib/db/seed-builtin-templates";
import { isKrea2StillTemplate } from "@/lib/db/builtin-template-ids";
import type { WorkflowTemplate } from "@/lib/db/schema";
import { getModels, healthCheck, isIpAdapterAvailable, listEndpoints } from "@/lib/services/comfyui-client";
import {
  getDefaultCharacterSheetTemplateId,
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";
import { hydrateProjectRenderSettings } from "@/lib/services/render-settings-resolver";
import { resolveImageSampler } from "@/lib/services/image-sampler";
import type { GenerationStack, RenderSettings } from "@/types";
import {
  detectKrea2Unet,
  filterImageGenerationCheckpoints,
  isKrea2ImageEngine,
  isKrea2UnetAvailable,
  pickDefaultImageCheckpoint,
  sortImageCheckpointsForPicker,
} from "@/lib/services/image-checkpoints";
import { nowMs } from "@/lib/utils";

export interface CheckpointResolution {
  checkpoint: string;
  autoSelected: boolean;
  invalidPreferred?: string;
}

export type { GenerationStack };

export async function resolveProjectEndpointUrl(
  projectId: string
): Promise<string> {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) throw new Error("Project not found");

  const appEndpoints = await getDefaultComfyuiEndpoints();
  const endpoints = resolveComfyuiEndpoints(
    project.comfyuiEndpointsJson,
    appEndpoints
  );
  const endpointUrl = await listEndpoints(endpoints);
  if (!endpointUrl) {
    throw new Error("No reachable ComfyUI endpoint configured");
  }
  return endpointUrl;
}

export async function resolveCheckpoint(
  baseUrl: string,
  renderSettings: RenderSettings,
  availableCheckpoints?: string[]
): Promise<CheckpointResolution> {
  const available =
    availableCheckpoints ?? (await getModels(baseUrl, "checkpoints"));

  if (available.length === 0) {
    throw new Error(
      "No checkpoint models found on ComfyUI. Add at least one .safetensors file to models/checkpoints."
    );
  }

  const preferred = renderSettings.checkpoint?.trim();
  if (preferred && available.includes(preferred)) {
    return { checkpoint: preferred, autoSelected: false };
  }

  return {
    checkpoint: pickDefaultImageCheckpoint(available),
    autoSelected: true,
    invalidPreferred: preferred || undefined,
  };
}

export function withResolvedCheckpoint(
  renderSettings: RenderSettings,
  checkpoint: string
): RenderSettings {
  return { ...renderSettings, checkpoint };
}

export async function ensureProjectRenderCheckpoint(
  projectId: string,
  endpointUrl?: string
): Promise<{ renderSettings: RenderSettings; resolution: CheckpointResolution }> {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) throw new Error("Project not found");

  const baseUrl = endpointUrl ?? (await resolveProjectEndpointUrl(projectId));
  const renderSettings = JSON.parse(
    project.renderSettingsJson || "{}"
  ) as RenderSettings;

  const resolution = await resolveCheckpoint(baseUrl, renderSettings);
  const needsPersist =
    renderSettings.checkpoint !== resolution.checkpoint ||
    Boolean(resolution.invalidPreferred);

  if (needsPersist) {
    const updated = withResolvedCheckpoint(
      renderSettings,
      resolution.checkpoint
    );
    db.update(schema.projects)
      .set({
        renderSettingsJson: JSON.stringify(updated),
        updatedAt: nowMs(),
      })
      .where(eq(schema.projects.id, projectId))
      .run();
    return { renderSettings: updated, resolution };
  }

  return { renderSettings, resolution };
}

export async function ensureProjectStillImageSettings(
  projectId: string,
  endpointUrl?: string,
  options?: { template?: WorkflowTemplate | null; templateId?: string }
): Promise<{ renderSettings: RenderSettings }> {
  const db = getDb();
  let template = options?.template ?? null;
  if (!template && options?.templateId) {
    template =
      db
        .select()
        .from(schema.workflowTemplates)
        .where(eq(schema.workflowTemplates.id, options.templateId))
        .get() ?? null;
  }

  if (template && isKrea2StillTemplate(template.id)) {
    const { renderSettings } = await hydrateProjectRenderSettings(projectId, {
      template,
      persist: true,
      updateAppDefaults: false,
    });
    return { renderSettings };
  }

  const { renderSettings } = await ensureProjectRenderCheckpoint(
    projectId,
    endpointUrl
  );
  return { renderSettings };
}

async function resolveCharacterSheetTemplateMeta(projectId: string): Promise<{
  id: string;
  name: string;
}> {
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

  const templateId =
    renderSettings.characterSheetTemplateId ??
    resolveDefaultCharacterSheetTemplateId(
      await getDefaultCharacterSheetTemplateId()
    );

  const template = db
    .select()
    .from(schema.workflowTemplates)
    .where(eq(schema.workflowTemplates.id, templateId))
    .get();

  return {
    id: templateId,
    name: template?.name ?? "Character sheet workflow",
  };
}

export async function getGenerationStack(
  projectId: string
): Promise<GenerationStack> {
  const endpointUrl = await resolveProjectEndpointUrl(projectId);
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get()!;

  const renderSettings = JSON.parse(
    project.renderSettingsJson || "{}"
  ) as RenderSettings;

  const availableCheckpoints = await getModels(endpointUrl, "checkpoints");
  const diffusionModels = await getModels(endpointUrl, "diffusion_models").catch(
    () => [] as string[]
  );
  const availableImageCheckpoints = sortImageCheckpointsForPicker(
    filterImageGenerationCheckpoints(availableCheckpoints)
  );
  const krea2Available = isKrea2UnetAvailable(diffusionModels);
  const template = await resolveCharacterSheetTemplateMeta(projectId);

  const imageEngine: GenerationStack["imageEngine"] =
    isKrea2ImageEngine(renderSettings.imageEngine) ||
    isKrea2StillTemplate(template.id)
      ? "krea2"
      : "sdxl";

  let effectiveCheckpoint: string | null = null;
  let needsCheckpointSelection = availableCheckpoints.length === 0;
  let effectiveImageUnet: string | null = renderSettings.imageUnet?.trim() || null;

  const configuredCheckpoint = renderSettings.checkpoint?.trim() || null;

  if (imageEngine === "krea2") {
    needsCheckpointSelection = !krea2Available || !effectiveImageUnet;
    if (krea2Available && !effectiveImageUnet) {
      effectiveImageUnet = detectKrea2Unet(diffusionModels) ?? null;
    }
  } else if (availableCheckpoints.length > 0) {
    try {
      const resolution = await resolveCheckpoint(
        endpointUrl,
        renderSettings,
        availableImageCheckpoints.length > 0
          ? availableImageCheckpoints
          : availableCheckpoints
      );
      effectiveCheckpoint = resolution.checkpoint;
      needsCheckpointSelection =
        !configuredCheckpoint ||
        !(availableImageCheckpoints.length > 0
          ? availableImageCheckpoints
          : availableCheckpoints
        ).includes(configuredCheckpoint);
    } catch {
      needsCheckpointSelection = true;
    }
  }

  return {
    endpointUrl,
    workflowTemplateId: template.id,
    workflowTemplateName: template.name,
    comfyuiReachable: await healthCheck(endpointUrl),
    ipAdapterAvailable: await isIpAdapterAvailable(endpointUrl),
    configuredCheckpoint,
    effectiveCheckpoint,
    needsCheckpointSelection,
    availableCheckpoints,
    availableImageCheckpoints,
    imageEngine,
    krea2Available,
    effectiveImageUnet,
    loras: renderSettings.loras ?? [],
    sampler: resolveImageSampler(renderSettings),
  };
}

export { BUILTIN_CHARACTER_SHEET_TEMPLATE_ID, BUILTIN_KREA2_STILL_TEMPLATE_ID };
