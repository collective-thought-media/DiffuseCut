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



export async function generateAceStepAudioFile(options: {

  prompt: string;

  durationSeconds: number;

  outputAbsolutePath: string;

  kind: "music" | "voiceover" | "sfx";

}): Promise<{

  provider: string;

  sourceSeconds: number;

  endpointUrl: string;

  aceStepPrompt?: {

    tags: string;

    lyrics: string;

    bpm: number;

    keyscale: string;

  };

}> {

  const mode = await getAceStepComputeModeSetting();



  if (mode === "remote") {

    const result = await generateRemoteAceStepAudioFile(options);

    return {

      provider: result.provider,

      sourceSeconds: result.sourceSeconds,

      endpointUrl: result.remoteUrl,

      aceStepPrompt: result.aceStepPrompt,

    };

  }



  const result = await generateNativeAceStepAudioFile(options);

  return {

    provider: result.provider,

    sourceSeconds: result.sourceSeconds,

    endpointUrl: `native://${result.installDir}`,

    aceStepPrompt: result.aceStepPrompt,

  };

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


