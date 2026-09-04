import { getDefaultComfyuiEndpoints } from "@/lib/services/settings";
import {
  generateComfyAceStepAudioFile,
  isComfyAceStepGenerationReady,
} from "@/lib/services/comfy-ace-step-generation";
import { aceStepPromptForKind } from "@/lib/services/ace-step-prompt";
import {
  getAceStepRemoteUrlSetting,
} from "@/lib/services/ace-step-compute";
import { isRemoteAceStepApiReachable } from "@/lib/services/remote-ace-step-api-generation";
import { generateRemoteAceStepApiAudioFile } from "@/lib/services/remote-ace-step-api-generation";
import { listEndpoints, normalizeUrl } from "@/lib/services/comfyui-client";

export type RemoteAceStepBackend = "api" | "comfy";

function hostFromUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

function comfyUrlOnSameHost(configuredUrl: string): string | null {
  const host = hostFromUrl(configuredUrl);
  if (!host) return null;
  return `http://${host}:8188`;
}

export async function resolveRemoteAceStepBackend(
  configuredUrl: string | null
): Promise<{ backend: RemoteAceStepBackend; url: string } | null> {
  if (configuredUrl) {
    const normalized = normalizeUrl(configuredUrl);
    if (await isRemoteAceStepApiReachable(normalized)) {
      return { backend: "api", url: normalized };
    }

    if (await isComfyAceStepGenerationReady(normalized)) {
      return { backend: "comfy", url: normalized };
    }

    const sameHostComfy = comfyUrlOnSameHost(normalized);
    if (
      sameHostComfy &&
      sameHostComfy !== normalized &&
      (await isComfyAceStepGenerationReady(sameHostComfy))
    ) {
      return { backend: "comfy", url: sameHostComfy };
    }
  }

  const endpoints = await getDefaultComfyuiEndpoints();
  const comfy = await listEndpoints(endpoints);
  if (comfy && (await isComfyAceStepGenerationReady(comfy))) {
    return { backend: "comfy", url: comfy };
  }

  return null;
}

export async function isRemoteAceStepGenerationReady(): Promise<boolean> {
  const configured = await getAceStepRemoteUrlSetting();
  const resolved = await resolveRemoteAceStepBackend(configured);
  return Boolean(resolved);
}

export async function generateRemoteAceStepAudioFile(options: {
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
  kind: "music" | "voiceover" | "sfx";
}): Promise<{
  provider: string;
  sourceSeconds: number;
  remoteUrl: string;
  aceStepPrompt?: {
    tags: string;
    lyrics: string;
    bpm: number;
    keyscale: string;
  };
}> {
  const configured = await getAceStepRemoteUrlSetting();
  const resolved = await resolveRemoteAceStepBackend(configured);
  if (!resolved) {
    throw new Error(
      "Remote ACE-Step is not reachable. Use http://YOUR-GPU-IP:8188 for ComfyUI ACE-Step on the LAN box, or start the native API on port 8002."
    );
  }

  if (resolved.backend === "api") {
    return generateRemoteAceStepApiAudioFile({
      ...options,
      remoteUrl: resolved.url,
    });
  }

  const scratchPath = options.outputAbsolutePath.endsWith(".mp3")
    ? options.outputAbsolutePath
    : options.outputAbsolutePath.replace(/\.[^.]+$/, ".mp3");

  const result = await generateComfyAceStepAudioFile({
    baseUrl: resolved.url,
    ...options,
    outputAbsolutePath: scratchPath,
  });

  return {
    provider: result.provider,
    sourceSeconds: result.sourceSeconds,
    remoteUrl: result.comfyUrl,
    aceStepPrompt: result.aceStepPrompt,
  };
}

export { aceStepPromptForKind };
