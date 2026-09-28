import {
  generateNativeAceStepAudioFile,
  isNativeAceStepGenerationReady,
} from "@/lib/services/native-ace-step-generation";
import {
  generateRemoteAceStepAudioFile,
  isRemoteAceStepGenerationReady,
} from "@/lib/services/remote-ace-step-generation";
import {
  getAceStepComputeModeSetting,
  isAceStepComputeReady,
} from "@/lib/services/ace-step-compute";
import { withComfyGpuLeaseForAudio } from "@/lib/services/comfy-gpu-gate";

export async function generateAceStepAudioFile(options: {
  prompt: string;
  durationSeconds: number;
  outputAbsolutePath: string;
  kind: "music" | "voiceover" | "sfx";
}): Promise<{
  provider: string;
  sourceSeconds: number;
  endpointUrl: string;
  writtenPath: string;
  aceStepPrompt?: {
    tags: string;
    lyrics: string;
    bpm: number;
    keyscale: string;
  };
  gpuWaitedMs?: number;
  gpuWaitedFor?: string | null;
}> {
  return withComfyGpuLeaseForAudio({
    holder: `audio:ace-step:${Date.now()}`,
    reason: "score generation (ACE-Step)",
    run: async () => {
      const mode = await getAceStepComputeModeSetting();

      if (mode === "remote") {
        const result = await generateRemoteAceStepAudioFile(options);
        return {
          provider: result.provider,
          sourceSeconds: result.sourceSeconds,
          endpointUrl: result.remoteUrl,
          writtenPath: result.writtenPath ?? options.outputAbsolutePath,
          aceStepPrompt: result.aceStepPrompt,
        };
      }

      const result = await generateNativeAceStepAudioFile(options);
      return {
        provider: result.provider,
        sourceSeconds: result.sourceSeconds,
        endpointUrl: `native://${result.installDir}`,
        writtenPath: result.writtenPath ?? options.outputAbsolutePath,
        aceStepPrompt: result.aceStepPrompt,
      };
    },
  });
}

export async function isAceStepGenerationReady(): Promise<boolean> {
  return isAceStepComputeReady();
}

export async function isAceStepGenerationReadyDetailed(): Promise<{
  local: boolean;
  remote: boolean;
}> {
  const [local, remote] = await Promise.all([
    isNativeAceStepGenerationReady(),
    isRemoteAceStepGenerationReady(),
  ]);
  return { local, remote };
}
