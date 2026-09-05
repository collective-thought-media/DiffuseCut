import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { WorkflowTemplate } from "@/lib/db/schema";
import { getModels, listEndpoints } from "@/lib/services/comfyui-client";
import { resolveCheckpoint } from "@/lib/services/generation-stack";
import {
  getDefaultComfyuiEndpoints,
  getDefaultRenderSettings,
  resolveComfyuiEndpoints,
  saveDefaultRenderSettings,
} from "@/lib/services/settings";
import { nowMs } from "@/lib/utils";
import { normalizeRenderSettings } from "@/lib/services/image-sampler";
import {
  resolveTemplateImageHints,
  resolveTemplateVideoHints,
} from "@/lib/db/builtin-template-ids";
import type { RenderSettings, WorkflowBindings } from "@/types";

const VIDEO_STACK_KEYS = [
  "videoCheckpoint",
  "videoUnet",
  "videoVae",
  "videoAudioVae",
  "videoTextEncoder",
  "videoWidth",
  "videoHeight",
  "sampler",
] as const satisfies ReadonlyArray<keyof RenderSettings>;

const IMAGE_STACK_KEYS = [
  "imageUnet",
  "imageVae",
  "imageTextEncoder",
  "imageEngine",
  "imageSampler",
] as const satisfies ReadonlyArray<keyof RenderSettings>;

const PLACEHOLDER_MODEL_RE =
  /^(your_|model\.safetensors$|.*your_.*\.safetensors$)/i;

function isEmpty(value: unknown): boolean {
  return value == null || value === "";
}

function isPlaceholderModel(value: string): boolean {
  return PLACEHOLDER_MODEL_RE.test(value.trim());
}

/** Later layers win; empty values in a layer do not overwrite earlier values. */
export function mergeRenderSettings(
  ...layers: Array<Partial<RenderSettings> | RenderSettings | undefined>
): RenderSettings {
  const merged: RenderSettings = {};

  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer) as Array<
      [keyof RenderSettings, RenderSettings[keyof RenderSettings]]
    >) {
      if (value === undefined || value === null || value === "") continue;
      (merged as Record<string, unknown>)[key as string] = value;
    }
  }

  return merged;
}

export function extractTemplateRenderDefaults(template: {
  workflowJson: string;
  bindingsJson: string;
}): Partial<RenderSettings> {
  let bindings: WorkflowBindings = {};
  let workflow: Record<string, { inputs?: Record<string, unknown> }> = {};

  try {
    bindings = JSON.parse(template.bindingsJson || "{}") as WorkflowBindings;
  } catch {
    return {};
  }

  try {
    workflow = JSON.parse(template.workflowJson || "{}") as Record<
      string,
      { inputs?: Record<string, unknown> }
    >;
  } catch {
    return {};
  }

  const defaults: Partial<RenderSettings> = {};

  for (const control of bindings.controls ?? []) {
    const node = workflow[control.nodeId];
    if (!node?.inputs) continue;

    const inputKey = control.nameInputKey ?? control.inputKey;
    if (!inputKey) continue;

    const raw = node.inputs[inputKey];
    if (typeof raw === "number") {
      if (control.type === "video_width") defaults.videoWidth = raw;
      if (control.type === "video_height") defaults.videoHeight = raw;
      continue;
    }

    if (typeof raw !== "string" || isPlaceholderModel(raw)) continue;

    switch (control.type) {
      case "checkpoint":
        defaults.checkpoint = raw;
        break;
      case "unet":
        defaults.videoUnet = raw;
        break;
      case "vae":
        defaults.videoVae = raw;
        break;
      case "audio_vae":
        defaults.videoAudioVae = raw;
        break;
      case "text_encoder":
        defaults.videoTextEncoder = raw;
        break;
      case "image_unet":
        defaults.imageUnet = raw;
        defaults.imageEngine = "krea2";
        break;
      case "image_vae":
        defaults.imageVae = raw;
        break;
      case "image_text_encoder":
        defaults.imageTextEncoder = raw;
        break;
      default:
        break;
    }
  }

  return defaults;
}

function modelMatchesHints(name: string, hints: string[]): boolean {
  const lower = name.toLowerCase();
  return hints.some((hint) => lower.includes(hint.toLowerCase()));
}

function pickModelName(
  available: string[],
  preferred: string | undefined,
  hints: string[],
  options?: { requireHintMatch?: boolean }
): string | undefined {
  const trimmed = preferred?.trim();
  if (trimmed && available.includes(trimmed)) {
    if (
      !options?.requireHintMatch ||
      modelMatchesHints(trimmed, hints)
    ) {
      return trimmed;
    }
  }

  for (const hint of hints) {
    const lower = hint.toLowerCase();
    const match = available.find((name) => name.toLowerCase().includes(lower));
    if (match) return match;
  }

  return options?.requireHintMatch ? undefined : available[0];
}

/** Drop video-model fields so template hydration can re-detect for the active engine. */
export function stripVideoStackSettings(
  settings: RenderSettings
): RenderSettings {
  const next = { ...settings };
  for (const key of VIDEO_STACK_KEYS) {
    delete next[key];
  }
  return next;
}

/** Drop Krea / still-image UNET stack fields before template hydration. */
export function stripImageStackSettings(
  settings: RenderSettings
): RenderSettings {
  const next = { ...settings };
  for (const key of IMAGE_STACK_KEYS) {
    delete next[key];
  }
  return next;
}

function isKrea2ImageStack(settings: RenderSettings): boolean {
  return (
    settings.imageEngine === "krea2" ||
    settings.imageUnet?.toLowerCase().includes("krea") === true
  );
}

function isLtxVideoStack(settings: RenderSettings): boolean {
  if (isMinimaxVideoStack(settings)) return false;
  return (
    settings.videoUnet?.toLowerCase().includes("ltx") === true ||
    settings.videoCheckpoint?.toLowerCase().includes("ltx") === true ||
    settings.videoVae?.toLowerCase().includes("ltx") === true ||
    settings.videoTextEncoder?.toLowerCase().includes("ltx") === true ||
    settings.videoTextEncoder?.toLowerCase().includes("gemma") === true
  );
}

function isMinimaxVideoStack(settings: RenderSettings): boolean {
  const hay = [
    settings.videoUnet,
    settings.videoVae,
    settings.videoAudioVae,
    settings.videoTextEncoder,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes("minimax") || hay.includes("h3");
}

function hintsTargetMinimax(hints: string[]): boolean {
  return hints.some((hint) => hint.toLowerCase().includes("minimax"));
}

function hintsTargetLtx(hints: string[]): boolean {
  return hints.some((hint) => hint.toLowerCase().includes("ltx"));
}

/** T5/CLIP encoders break LTX 2.3 AV loader with "invalid tokenizer". */
function isIncompatibleLtxTextEncoder(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("t5xxl") ||
    lower.includes("clip_l") ||
    lower.includes("qwen") ||
    lower.includes("minimax") ||
    lower.includes("umt5")
  );
}

function resolveLtxVideoTextEncoder(
  available: string[],
  preferred: string | undefined
): string | undefined {
  const trimmed = preferred?.trim();
  if (
    trimmed &&
    available.includes(trimmed) &&
    !isIncompatibleLtxTextEncoder(trimmed)
  ) {
    return trimmed;
  }

  const safePreferred =
    trimmed && isIncompatibleLtxTextEncoder(trimmed) ? undefined : trimmed;

  return pickModelName(available, safePreferred, ["gemma", "ltx"]);
}

export function loadKnownGoodVideoSettingsFromDb(): Partial<RenderSettings> {
  const db = getDb();
  const projects = db
    .select({
      id: schema.projects.id,
      renderSettingsJson: schema.projects.renderSettingsJson,
    })
    .from(schema.projects)
    .all();

  let best: { settings: RenderSettings; count: number } | null = null;

  for (const project of projects) {
    let settings: RenderSettings = {};
    try {
      settings = JSON.parse(
        project.renderSettingsJson || "{}"
      ) as RenderSettings;
    } catch {
      continue;
    }

    if (!settings.videoUnet && !settings.videoCheckpoint) continue;

    const completedCount = db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.projectId, project.id))
      .all()
      .filter((job) => job.status === "completed").length;

    if (completedCount === 0) continue;
    if (!best || completedCount > best.count) {
      best = { settings, count: completedCount };
    }
  }

  return best?.settings ?? {};
}

async function loadVideoModelFolders(baseUrl: string) {
  const [unet, diffusionModels, vae, textEncoders, checkpoints] =
    await Promise.all([
      getModels(baseUrl, "unet").catch(() => [] as string[]),
      getModels(baseUrl, "diffusion_models").catch(() => [] as string[]),
      getModels(baseUrl, "vae").catch(() => [] as string[]),
      getModels(baseUrl, "text_encoders").catch(() => [] as string[]),
      getModels(baseUrl, "checkpoints").catch(() => [] as string[]),
    ]);

  return {
    unet: [...new Set([...unet, ...diffusionModels])],
    vae,
    textEncoders,
    checkpoints,
  };
}

export async function resolveRenderSettingsFromComfyUI(
  baseUrl: string,
  renderSettings: RenderSettings,
  options?: {
    videoHints?: string[];
    imageHints?: string[];
    requireHintMatch?: boolean;
  }
): Promise<RenderSettings> {
  const videoHints = options?.videoHints;
  const imageHints = options?.imageHints;
  const requireHintMatch = options?.requireHintMatch ?? false;
  const pickOptions = { requireHintMatch };
  const folders = await loadVideoModelFolders(baseUrl);
  const resolved = { ...renderSettings };

  if (imageHints && imageHints.length > 0) {
    const unetHints = ["krea2", "krea", "turbo"];
    if (isEmpty(resolved.imageUnet) && folders.unet.length > 0) {
      resolved.imageUnet = pickModelName(
        folders.unet,
        resolved.imageUnet,
        unetHints,
        pickOptions
      );
    } else if (!isEmpty(resolved.imageUnet)) {
      resolved.imageUnet = pickModelName(
        folders.unet,
        resolved.imageUnet,
        unetHints,
        pickOptions
      );
    }

    const vaeHints = ["qwen_image_vae", "qwen"];
    if (isEmpty(resolved.imageVae) && folders.vae.length > 0) {
      resolved.imageVae = pickModelName(
        folders.vae,
        resolved.imageVae,
        vaeHints,
        pickOptions
      );
    } else if (!isEmpty(resolved.imageVae)) {
      resolved.imageVae = pickModelName(
        folders.vae,
        resolved.imageVae,
        vaeHints,
        pickOptions
      );
    }

    const textEncoderHints = ["qwen3vl", "krea"];
    if (isEmpty(resolved.imageTextEncoder) && folders.textEncoders.length > 0) {
      resolved.imageTextEncoder = pickModelName(
        folders.textEncoders,
        resolved.imageTextEncoder,
        textEncoderHints,
        pickOptions
      );
    } else if (!isEmpty(resolved.imageTextEncoder)) {
      resolved.imageTextEncoder = pickModelName(
        folders.textEncoders,
        resolved.imageTextEncoder,
        textEncoderHints,
        pickOptions
      );
    }

    if (isKrea2ImageStack(resolved)) {
      resolved.imageEngine = "krea2";
      resolved.imageSampler = {
        ...resolved.imageSampler,
        steps: resolved.imageSampler?.steps ?? 8,
        cfg: resolved.imageSampler?.cfg ?? 1,
        scheduler: resolved.imageSampler?.scheduler ?? "simple",
        sampler_name: resolved.imageSampler?.sampler_name ?? "euler",
      };
    }

    return resolved;
  }

  const hints = videoHints ?? ["ltx", "minimax"];
  const minimaxHints = hintsTargetMinimax(hints);
  const ltxHints = hintsTargetLtx(hints);
  const ltxOnly = ltxHints && !minimaxHints;
  const minimaxOnly = minimaxHints && !ltxHints;

  const sdxlCheckpoints = folders.checkpoints.filter(
    (name) => !name.toLowerCase().includes("ltx")
  );
  const checkpointPool =
    sdxlCheckpoints.length > 0 ? sdxlCheckpoints : folders.checkpoints;

  if (checkpointPool.length > 0) {
    const checkpointResolution = await resolveCheckpoint(
      baseUrl,
      resolved,
      checkpointPool
    );
    resolved.checkpoint = checkpointResolution.checkpoint;
  }

  if (ltxOnly) {
    if (isEmpty(resolved.videoCheckpoint) && folders.checkpoints.length > 0) {
      resolved.videoCheckpoint = pickModelName(
        folders.checkpoints,
        resolved.videoCheckpoint,
        hints,
        pickOptions
      );
    } else if (!isEmpty(resolved.videoCheckpoint)) {
      resolved.videoCheckpoint = pickModelName(
        folders.checkpoints,
        resolved.videoCheckpoint,
        hints,
        pickOptions
      );
    }
  } else if (minimaxOnly) {
    resolved.videoCheckpoint = undefined;
  }

  const unetHints = minimaxOnly ? ["minimax", "h3", "fl2va"] : hints;
  if (isEmpty(resolved.videoUnet) && folders.unet.length > 0) {
    resolved.videoUnet = pickModelName(
      folders.unet,
      resolved.videoUnet,
      unetHints,
      pickOptions
    );
  } else if (!isEmpty(resolved.videoUnet)) {
    resolved.videoUnet = pickModelName(
      folders.unet,
      resolved.videoUnet,
      unetHints,
      pickOptions
    );
  }

  const vaeHints = minimaxOnly
    ? ["minimax_h3_video", "minimax", "h3"]
    : ltxOnly
      ? ["ltx"]
      : hints;
  if (isEmpty(resolved.videoVae) && folders.vae.length > 0) {
    resolved.videoVae = pickModelName(
      folders.vae,
      resolved.videoVae,
      vaeHints,
      pickOptions
    );
  } else if (!isEmpty(resolved.videoVae)) {
    resolved.videoVae = pickModelName(
      folders.vae,
      resolved.videoVae,
      vaeHints,
      pickOptions
    );
  }

  const audioVaeHints = ["minimax_h3_audio", "minimax", "audio"];
  if (minimaxOnly) {
    if (isEmpty(resolved.videoAudioVae) && folders.vae.length > 0) {
      resolved.videoAudioVae = pickModelName(
        folders.vae,
        resolved.videoAudioVae,
        audioVaeHints,
        pickOptions
      );
    } else if (!isEmpty(resolved.videoAudioVae)) {
      resolved.videoAudioVae = pickModelName(
        folders.vae,
        resolved.videoAudioVae,
        audioVaeHints,
        pickOptions
      );
    }
  } else if (ltxOnly) {
    resolved.videoAudioVae = undefined;
  }

  const textEncoderHints = minimaxOnly
    ? ["qwen3vl", "minimax", "h3"]
    : ltxOnly
      ? ["gemma", "ltx"]
      : hints;

  if (ltxOnly && folders.textEncoders.length > 0) {
    resolved.videoTextEncoder = resolveLtxVideoTextEncoder(
      folders.textEncoders,
      resolved.videoTextEncoder
    );
  } else if (isEmpty(resolved.videoTextEncoder) && folders.textEncoders.length > 0) {
    resolved.videoTextEncoder = pickModelName(
      folders.textEncoders,
      resolved.videoTextEncoder,
      textEncoderHints,
      pickOptions
    );
  } else if (!isEmpty(resolved.videoTextEncoder)) {
    resolved.videoTextEncoder = pickModelName(
      folders.textEncoders,
      resolved.videoTextEncoder,
      textEncoderHints,
      pickOptions
    );
  }

  if (minimaxOnly || isMinimaxVideoStack(resolved)) {
    if (resolved.videoWidth == null) resolved.videoWidth = 1344;
    if (resolved.videoHeight == null) resolved.videoHeight = 768;
    resolved.sampler = {
      ...resolved.sampler,
      steps: resolved.sampler?.steps ?? 20,
      cfg: 1,
      scheduler: resolved.sampler?.scheduler ?? "simple",
      sampler_name: resolved.sampler?.sampler_name ?? "res_multistep",
    };
  }

  if (ltxOnly || isLtxVideoStack(resolved)) {
    if (resolved.videoWidth == null) resolved.videoWidth = 1920;
    if (resolved.videoHeight == null) resolved.videoHeight = 1080;
    resolved.sampler = {
      ...resolved.sampler,
      steps: resolved.sampler?.steps ?? 20,
      cfg: resolved.sampler?.cfg ?? 1,
      sampler_name: resolved.sampler?.sampler_name ?? "euler",
      scheduler: resolved.sampler?.scheduler ?? "normal",
    };
  }

  return resolved;
}

function renderSettingsEqual(a: RenderSettings, b: RenderSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function hydrateProjectRenderSettings(
  projectId: string,
  options?: {
    template?: WorkflowTemplate | null;
    persist?: boolean;
    updateAppDefaults?: boolean;
  }
): Promise<{ renderSettings: RenderSettings; changed: boolean }> {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) throw new Error("Project not found");

  let projectSettings: RenderSettings = {};
  try {
    projectSettings = JSON.parse(
      project.renderSettingsJson || "{}"
    ) as RenderSettings;
  } catch {
    projectSettings = {};
  }

  const appDefaults = await getDefaultRenderSettings();
  const knownGoodVideo = loadKnownGoodVideoSettingsFromDb();
  const templateDefaults = options?.template
    ? extractTemplateRenderDefaults(options.template)
    : {};
  const templateScoped = Boolean(options?.template?.id);
  const videoHints =
    options?.template?.purpose === "shot_video" && options?.template?.id
      ? resolveTemplateVideoHints(options.template.id)
      : undefined;
  const imageHints =
    options?.template?.id
      ? resolveTemplateImageHints(options.template.id)
      : undefined;
  const hasImageHints = Boolean(imageHints && imageHints.length > 0);
  const hasVideoHints = Boolean(videoHints && videoHints.length > 0);

  let merged = mergeRenderSettings(appDefaults, projectSettings);

  if (templateScoped && hasVideoHints) {
    merged = stripVideoStackSettings(merged);
    merged = mergeRenderSettings(templateDefaults, merged);
  } else if (templateScoped && hasImageHints) {
    merged = stripImageStackSettings(merged);
    merged = mergeRenderSettings(templateDefaults, merged);
  } else if (templateScoped) {
    merged = mergeRenderSettings(templateDefaults, merged);
  } else {
    merged = mergeRenderSettings(knownGoodVideo, templateDefaults, merged);
  }

  if (options?.template?.id) {
    merged.workflowTemplateId = options.template.id;
  }

  const appEndpoints = await getDefaultComfyuiEndpoints();
  const endpoints = resolveComfyuiEndpoints(
    project.comfyuiEndpointsJson,
    appEndpoints
  );
  const endpointUrl = await listEndpoints(endpoints);

  if (endpointUrl) {
    try {
      merged = await resolveRenderSettingsFromComfyUI(endpointUrl, merged, {
        videoHints: hasVideoHints ? videoHints : undefined,
        imageHints: hasImageHints ? imageHints : undefined,
        requireHintMatch: templateScoped && (hasVideoHints || hasImageHints),
      });
    } catch {
      /* ComfyUI unreachable: keep merged defaults without model auto-pick */
    }
  }

  merged = normalizeRenderSettings(merged);

  const changed = !renderSettingsEqual(projectSettings, merged);

  if (changed && options?.persist !== false) {
    db.update(schema.projects)
      .set({
        renderSettingsJson: JSON.stringify(merged),
        updatedAt: nowMs(),
      })
      .where(eq(schema.projects.id, projectId))
      .run();
  }

  if (options?.updateAppDefaults !== false && changed) {
    await saveDefaultRenderSettings(mergeRenderSettings(appDefaults, merged));
  }

  return { renderSettings: merged, changed };
}

export function parseProjectRenderSettings(
  renderSettingsJson: string | null | undefined
): RenderSettings {
  try {
    return JSON.parse(renderSettingsJson || "{}") as RenderSettings;
  } catch {
    return {};
  }
}
