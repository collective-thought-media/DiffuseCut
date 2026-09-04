import type { NextRequest } from "next/server";

import {

  jsonOk,

  jsonError,

  handleApiError,

  parseJson,

} from "@/lib/api-helpers";

import { setCachedAppDataDir } from "@/lib/paths/app-paths";

import {

  loadSettings,

  setSetting,

} from "@/lib/services/settings";



interface SettingsUpdateBody {

  appDataDir?: string | null;

  ffmpegPath?: string | null;

  defaultComfyuiEndpointsJson?: string | null;

  defaultComfyuiEndpoints?: string[] | null;

  defaultCharacterSheetTemplateId?: string | null;

  llmPromptExpandEnabled?: boolean;

  llmProvider?: "openai" | "ollama" | "none" | null;

  llmApiUrl?: string | null;

  llmModel?: string | null;

  llmApiKey?: string | null;

  musicApiKey?: string | null;

  scoreAudioProvider?: "auto" | "ace_step" | "elevenlabs" | "upload" | null;

  aceStepInstallDir?: string | null;

  aceStepComputeMode?: "local" | "remote" | null;

  aceStepRemoteUrl?: string | null;

}



export async function GET() {

  try {

    const settings = await loadSettings();

    return jsonOk({ settings });

  } catch (err) {

    return handleApiError(err);

  }

}



export async function PUT(req: NextRequest) {

  try {

    const body = await parseJson<SettingsUpdateBody>(req);



    if (body.appDataDir !== undefined) {

      if (body.appDataDir === null || body.appDataDir === "") {

        await setSetting("app_data_dir", "");

        setCachedAppDataDir("");

      } else {

        await setSetting("app_data_dir", body.appDataDir);

        setCachedAppDataDir(body.appDataDir);

      }

    }



    if (body.ffmpegPath !== undefined) {

      await setSetting("ffmpeg_path", body.ffmpegPath ?? "");

    }



    if (body.defaultComfyuiEndpointsJson !== undefined) {

      if (body.defaultComfyuiEndpointsJson === null) {

        await setSetting("default_comfyui_endpoints_json", "");

      } else {

        JSON.parse(body.defaultComfyuiEndpointsJson);

        await setSetting(

          "default_comfyui_endpoints_json",

          body.defaultComfyuiEndpointsJson

        );

      }

    } else if (body.defaultComfyuiEndpoints !== undefined) {

      const endpoints = body.defaultComfyuiEndpoints ?? [];

      if (!Array.isArray(endpoints)) {

        return jsonError("defaultComfyuiEndpoints must be an array", 400);

      }

      await setSetting(

        "default_comfyui_endpoints_json",

        JSON.stringify(endpoints)

      );

    }



    if (body.defaultCharacterSheetTemplateId !== undefined) {

      await setSetting(

        "default_character_sheet_template_id",

        body.defaultCharacterSheetTemplateId ?? ""

      );

    }



    if (body.llmPromptExpandEnabled !== undefined) {

      await setSetting(

        "llm_prompt_expand_enabled",

        body.llmPromptExpandEnabled ? "true" : "false"

      );

    }



    if (body.llmProvider !== undefined) {

      await setSetting("llm_provider", body.llmProvider ?? "none");

    }



    if (body.llmApiUrl !== undefined) {

      await setSetting("llm_api_url", body.llmApiUrl ?? "");

    }



    if (body.llmModel !== undefined) {

      await setSetting("llm_model", body.llmModel ?? "");

    }



    if (body.llmApiKey !== undefined && body.llmApiKey) {

      await setSetting("llm_api_key", body.llmApiKey);

    }



    if (body.musicApiKey !== undefined && body.musicApiKey) {

      await setSetting("music_api_key", body.musicApiKey);

    }



    if (body.scoreAudioProvider !== undefined) {

      await setSetting("score_audio_provider", body.scoreAudioProvider ?? "auto");

    }



    if (body.aceStepInstallDir !== undefined) {

      await setSetting("ace_step_install_dir", body.aceStepInstallDir ?? "");

    }



    if (body.aceStepComputeMode !== undefined) {

      const mode = body.aceStepComputeMode === "remote" ? "remote" : "local";

      await setSetting("ace_step_compute_mode", mode);

    }



    if (body.aceStepRemoteUrl !== undefined) {

      await setSetting("ace_step_remote_url", body.aceStepRemoteUrl ?? "");

    }



    const settings = await loadSettings();

    return jsonOk({ settings });

  } catch (err) {

    if (err instanceof SyntaxError) {

      return jsonError("defaultComfyuiEndpointsJson must be valid JSON", 400);

    }

    return handleApiError(err);

  }

}

