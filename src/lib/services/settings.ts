import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
  resolveDefaultCharacterSheetTemplateId,
} from "@/lib/db/seed-builtin-templates";
import type { RenderSettings } from "@/types";

const DEFAULT_ENDPOINTS = JSON.stringify(["http://127.0.0.1:8188"]);

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const row = db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .get();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const db = getDb();
  db.insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value },
    })
    .run();
}

export async function getAppDataDirSetting(): Promise<string | null> {
  return getSetting("app_data_dir");
}

export async function getFfmpegPathSetting(): Promise<string | null> {
  return getSetting("ffmpeg_path");
}

export async function getDefaultComfyuiEndpoints(): Promise<string[]> {
  const raw =
    (await getSetting("default_comfyui_endpoints_json")) ?? DEFAULT_ENDPOINTS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : ["http://127.0.0.1:8188"];
  } catch {
    return ["http://127.0.0.1:8188"];
  }
}

export function resolveComfyuiEndpoints(
  projectEndpointsJson: string | null | undefined,
  appEndpoints: string[]
): string[] {
  if (projectEndpointsJson) {
    try {
      const parsed = JSON.parse(projectEndpointsJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* fall through */
    }
  }
  return appEndpoints.length > 0 ? appEndpoints : ["http://127.0.0.1:8188"];
}

export async function loadSettings() {
  const configuredSheetTemplateId = await getDefaultCharacterSheetTemplateId();
  return {
    appDataDir: await getAppDataDirSetting(),
    ffmpegPath: await getFfmpegPathSetting(),
    comfyuiEndpoints: await getDefaultComfyuiEndpoints(),
    defaultCharacterSheetTemplateId: resolveDefaultCharacterSheetTemplateId(
      configuredSheetTemplateId
    ),
    builtinCharacterSheetTemplateId: BUILTIN_CHARACTER_SHEET_TEMPLATE_ID,
    llmPromptExpandEnabled: (await getSetting("llm_prompt_expand_enabled")) === "true",
    llmProvider: (await getSetting("llm_provider")) ?? "none",
    llmApiUrl: (await getSetting("llm_api_url")) ?? "",
    llmModel: (await getSetting("llm_model")) ?? "",
    llmApiKeySet: Boolean(await getSetting("llm_api_key")),
    musicApiKeySet: Boolean(await getSetting("music_api_key")),
    scoreAudioProvider:
      (await getSetting("score_audio_provider")) ?? "auto",
    aceStepInstallDir: (await getSetting("ace_step_install_dir")) ?? "",
    aceStepComputeMode:
      (await getSetting("ace_step_compute_mode")) === "remote"
        ? "remote"
        : "local",
    aceStepRemoteUrl: (await getSetting("ace_step_remote_url")) ?? "",
    aceStepCheckpoint: (await getSetting("ace_step_checkpoint")) ?? "",
  };
}

export async function getAceStepInstallDirSetting(): Promise<string | null> {
  const value = await getSetting("ace_step_install_dir");
  return value?.trim() || null;
}

export async function getAceStepCheckpointSetting(): Promise<string | null> {
  const value = await getSetting("ace_step_checkpoint");
  return value?.trim() || null;
}

export async function getScoreAudioProviderSetting(): Promise<string> {
  return (await getSetting("score_audio_provider")) ?? "auto";
}

export async function getDefaultCharacterSheetTemplateId(): Promise<string | null> {
  return getSetting("default_character_sheet_template_id");
}

export async function getDefaultRenderSettings(): Promise<RenderSettings> {
  const raw = await getSetting("default_render_settings_json");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RenderSettings;
  } catch {
    return {};
  }
}

export async function saveDefaultRenderSettings(
  renderSettings: RenderSettings
): Promise<void> {
  await setSetting(
    "default_render_settings_json",
    JSON.stringify(renderSettings)
  );
}
