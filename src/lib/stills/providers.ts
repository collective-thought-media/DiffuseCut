import type {
  StillBrief,
  StillJobResult,
  StillProvider,
  StillProviderCapabilities,
  StillProviderContext,
  StillProviderId,
} from "./still-brief";
import { recommendTechnique, resolvePromptSent } from "./techniques";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

function baseCaps(
  partial: StillProviderCapabilities
): StillProviderCapabilities {
  return partial;
}

/** Local Comfy thin path: no Integrate soup. Profiles only. */
export function createLocalComfyThinProvider(opts?: {
  endpointUrl?: string;
}): StillProvider {
  const endpointUrl = opts?.endpointUrl ?? "http://127.0.0.1:8188";
  return {
    capabilities: baseCaps({
      id: "local_comfy_thin",
      label: "Local Comfy (thin profiles)",
      kind: "local",
      techniques: [
        "prompt_only",
        "ip_adapter",
        "img2img_continuity",
        "optical_punch_in",
        "instruction_edit",
        "id_adapter",
      ],
      maxRefs: 4,
      requiresApiKey: false,
      notes:
        "Uses named profiles only. Default preprocess off. Does not claim Cursor parity.",
    }),
    async isAvailable() {
      try {
        const res = await fetch(`${endpointUrl}/system_stats`, {
          signal: AbortSignal.timeout(2500),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    async compose(brief, ctx) {
      // Implementation lands with the first thin profile wiring.
      // For now this provider refuses rather than silently calling mode soup.
      const promptSent = resolvePromptSent(brief);
      return {
        jobId: nanoid(),
        providerId: "local_comfy_thin",
        brief,
        status: "failed",
        options: [],
        promptSent,
        errorMessage:
          "local_comfy_thin compose is scaffolded. Wire a single thin profile before enabling in UI. Use google_gemini_image, fal_flux, or folder_import for Sand Storm–class seeds.",
        createdAt: Date.now(),
        completedAt: Date.now(),
      } satisfies StillJobResult;
    },
  };
}

/**
 * Google Gemini Image (Nano Banana / Imagen multimodal).
 * Same family Cursor has routed GenerateImage through (default can change on
 * Cursor's side; DiffuseCut pins via API model id in settings).
 */
export function createGoogleGeminiImageProvider(opts: {
  apiKey: string;
  model?: string;
}): StillProvider {
  const model = opts.model ?? "gemini-3-pro-image-preview";
  return {
    capabilities: baseCaps({
      id: "google_gemini_image",
      label: "Google Gemini Image",
      kind: "cloud",
      techniques: ["multi_ref_native", "instruction_edit", "prompt_only"],
      maxRefs: 8,
      requiresApiKey: true,
      cursorParityFamily: true,
      notes:
        "Closest programmatic match to Cursor GenerateImage when Cursor defaults to Nano Banana Pro / Gemini Image.",
    }),
    async isAvailable() {
      return Boolean(opts.apiKey?.trim());
    },
    async compose(brief, ctx) {
      const promptSent = resolvePromptSent(brief);
      // Scaffold: real HTTP call lands in a follow-up. Eval harness can mock.
      return unavailableCloudResult(
        "google_gemini_image",
        brief,
        promptSent,
        `Gemini Image provider scaffolded for model ${model}. Set GOOGLE_AI_API_KEY and implement generateContent image parts.`
      );
    },
  };
}

export function createFalFluxProvider(opts: {
  apiKey: string;
  endpoint?: string;
}): StillProvider {
  const endpoint = opts.endpoint ?? "fal-ai/flux-pro/kontext";
  return {
    capabilities: baseCaps({
      id: "fal_flux",
      label: "fal Flux (Kontext / Redux)",
      kind: "cloud",
      techniques: [
        "multi_ref_native",
        "instruction_edit",
        "ip_adapter",
        "prompt_only",
      ],
      maxRefs: 4,
      requiresApiKey: true,
      notes: "Strong open-weight cloud path for multi-ref edits on a 3090-class budget.",
    }),
    async isAvailable() {
      return Boolean(opts.apiKey?.trim());
    },
    async compose(brief) {
      return unavailableCloudResult(
        "fal_flux",
        brief,
        resolvePromptSent(brief),
        `fal Flux provider scaffolded for endpoint ${endpoint}.`
      );
    },
  };
}

export function createOpenAiImagesProvider(opts: {
  apiKey: string;
  model?: string;
}): StillProvider {
  const model = opts.model ?? "gpt-image-1";
  return {
    capabilities: baseCaps({
      id: "openai_images",
      label: "OpenAI Images",
      kind: "cloud",
      techniques: ["prompt_only", "instruction_edit", "multi_ref_native"],
      maxRefs: 4,
      requiresApiKey: true,
    }),
    async isAvailable() {
      return Boolean(opts.apiKey?.trim());
    },
    async compose(brief) {
      return unavailableCloudResult(
        "openai_images",
        brief,
        resolvePromptSent(brief),
        `OpenAI Images provider scaffolded for model ${model}.`
      );
    },
  };
}

export function createReplicateProvider(opts: { apiKey: string }): StillProvider {
  return {
    capabilities: baseCaps({
      id: "replicate",
      label: "Replicate",
      kind: "cloud",
      techniques: ["multi_ref_native", "id_adapter", "prompt_only", "ip_adapter"],
      maxRefs: 4,
      requiresApiKey: true,
      notes: "Model-flexible relay (Flux, PuLID, etc.).",
    }),
    async isAvailable() {
      return Boolean(opts.apiKey?.trim());
    },
    async compose(brief) {
      return unavailableCloudResult(
        "replicate",
        brief,
        resolvePromptSent(brief),
        "Replicate provider scaffolded."
      );
    },
  };
}

/**
 * Midjourney has no stable official public HTTP API for all users.
 * Bridge = operator pastes URL / drops Discord export into inbox, or a
 * third-party relay key when the operator configures one.
 */
export function createMidjourneyBridgeProvider(opts?: {
  relayUrl?: string;
  apiKey?: string;
}): StillProvider {
  return {
    capabilities: baseCaps({
      id: "midjourney_bridge",
      label: "Midjourney bridge",
      kind: "import",
      techniques: ["identity_style_split", "external_import", "prompt_only"],
      maxRefs: 4,
      requiresApiKey: Boolean(opts?.apiKey),
      notes:
        "Prefer folder_import for Discord exports. Optional relay when configured.",
    }),
    async isAvailable() {
      return true;
    },
    async compose(brief) {
      return unavailableCloudResult(
        "midjourney_bridge",
        brief,
        resolvePromptSent(brief),
        opts?.relayUrl
          ? `Midjourney relay scaffolded for ${opts.relayUrl}.`
          : "No Midjourney relay configured. Use folder_import with Discord exports, or set a relay URL."
      );
    },
  };
}

export function createNightCafeProvider(opts: {
  apiKey: string;
}): StillProvider {
  return {
    capabilities: baseCaps({
      id: "nightcafe",
      label: "NightCafe",
      kind: "cloud",
      techniques: ["prompt_only", "ip_adapter", "external_import"],
      maxRefs: 2,
      requiresApiKey: true,
    }),
    async isAvailable() {
      return Boolean(opts.apiKey?.trim());
    },
    async compose(brief) {
      return unavailableCloudResult(
        "nightcafe",
        brief,
        resolvePromptSent(brief),
        "NightCafe provider scaffolded."
      );
    },
  };
}

/**
 * First-class ingest for Cursor assets, Midjourney Discord saves, NightCafe
 * downloads, or any external PNG/JPEG. DiffuseCut still owns shot attach.
 */
export function createFolderImportProvider(): StillProvider {
  return {
    capabilities: baseCaps({
      id: "folder_import",
      label: "Folder import",
      kind: "import",
      techniques: ["external_import"],
      maxRefs: 0,
      requiresApiKey: false,
      notes:
        "Pass providerOptions.importPaths: string[] of absolute files to copy into the shot still inbox.",
    }),
    async isAvailable() {
      return true;
    },
    async compose(brief, ctx) {
      const promptSent = resolvePromptSent(brief);
      const raw = brief.providerOptions?.importPaths;
      const importPaths = Array.isArray(raw)
        ? raw.filter((p): p is string => typeof p === "string")
        : [];
      if (importPaths.length === 0) {
        return {
          jobId: nanoid(),
          providerId: "folder_import",
          brief,
          status: "failed",
          options: [],
          promptSent,
          errorMessage:
            "folder_import requires providerOptions.importPaths (string[]).",
          createdAt: Date.now(),
          completedAt: Date.now(),
        };
      }

      fs.mkdirSync(ctx.outputDir, { recursive: true });
      const options = importPaths.map((src, i) => {
        if (!fs.existsSync(src)) {
          throw new Error(`Import path missing: ${src}`);
        }
        const ext = path.extname(src) || ".png";
        const dest = path.join(ctx.outputDir, `import-${nanoid(8)}-${i}${ext}`);
        fs.copyFileSync(src, dest);
        return {
          id: nanoid(),
          localPath: dest,
          techniqueUsed: "external_import" as const,
          providerMeta: { sourcePath: src },
        };
      });

      return {
        jobId: nanoid(),
        providerId: "folder_import",
        brief,
        status: "completed",
        options,
        promptSent,
        createdAt: Date.now(),
        completedAt: Date.now(),
      };
    },
  };
}

function unavailableCloudResult(
  providerId: StillProviderId,
  brief: StillBrief,
  promptSent: string,
  errorMessage: string
): StillJobResult {
  return {
    jobId: nanoid(),
    providerId,
    brief,
    status: "failed",
    options: [],
    promptSent,
    errorMessage,
    createdAt: Date.now(),
    completedAt: Date.now(),
  };
}

export function buildStillProviderRegistry(env: {
  googleAiApiKey?: string;
  falApiKey?: string;
  openaiApiKey?: string;
  replicateApiKey?: string;
  nightCafeApiKey?: string;
  midjourneyRelayUrl?: string;
  midjourneyApiKey?: string;
  comfyEndpointUrl?: string;
}): StillProvider[] {
  return [
    createLocalComfyThinProvider({ endpointUrl: env.comfyEndpointUrl }),
    createGoogleGeminiImageProvider({
      apiKey: env.googleAiApiKey ?? "",
    }),
    createFalFluxProvider({ apiKey: env.falApiKey ?? "" }),
    createOpenAiImagesProvider({ apiKey: env.openaiApiKey ?? "" }),
    createReplicateProvider({ apiKey: env.replicateApiKey ?? "" }),
    createMidjourneyBridgeProvider({
      relayUrl: env.midjourneyRelayUrl,
      apiKey: env.midjourneyApiKey,
    }),
    createNightCafeProvider({ apiKey: env.nightCafeApiKey ?? "" }),
    createFolderImportProvider(),
  ];
}

export function pickProvider(
  providers: StillProvider[],
  id: string
): StillProvider | undefined {
  return providers.find((p) => p.capabilities.id === id);
}

export function suggestProviderForBrief(
  providers: StillProvider[],
  brief: StillBrief
): StillProvider | undefined {
  const technique = recommendTechnique(brief);
  const availableCloud = providers.filter(
    (p) =>
      p.capabilities.kind === "cloud" &&
      p.capabilities.techniques.includes(technique)
  );
  const cursorFamily = availableCloud.find(
    (p) => p.capabilities.cursorParityFamily
  );
  if (cursorFamily) return cursorFamily;
  if (availableCloud[0]) return availableCloud[0];
  return providers.find((p) => p.capabilities.id === "local_comfy_thin");
}

export type { StillProvider, StillProviderContext, StillBrief };
