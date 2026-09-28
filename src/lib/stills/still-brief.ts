/**
 * Still Director contracts.
 *
 * DiffuseCut owns character / location canon and shot attachment.
 * A StillProvider turns a StillBrief into image options. Providers may be
 * local Comfy, cloud APIs, or an import bridge for Midjourney / Cursor / etc.
 *
 * Design rule: the brief is operator language. Providers must not require
 * DiffuseCut mode soup (Integrate / Dual / Scene edit). Optional advanced
 * knobs live on the provider, not in a global preprocess hammer.
 */

export type StillRefRole =
  | "identity"
  | "set"
  | "prop"
  | "light"
  | "style"
  | "composition";

/** One reference file with an explicit job in the compose call. */
export type StillRef = {
  role: StillRefRole;
  /** Absolute or project-relative path resolved by DiffuseCut before dispatch. */
  path: string;
  /**
   * Soft strength hint 0..1. Providers map this to their native control
   * (IP-Adapter weight, Midjourney cref, Gemini ref influence, etc.).
   * Omit to let the provider default for that role.
   */
  strength?: number;
  label?: string;
};

/**
 * Named technique profiles. These are industry patterns, not DiffuseCut
 * workflow-template IDs. A provider implements the ones it can.
 */
export type StillTechnique =
  /** Multi-image native conditioning (Gemini Image / Nano Banana class). */
  | "multi_ref_native"
  /** Separate identity lock vs style/set lock (Midjourney cref + sref pattern). */
  | "identity_style_split"
  /** Face/ID networks: InstantID, PuLID, IP-Adapter FaceID. */
  | "id_adapter"
  /** General IP-Adapter / Redux for sheet or plate lock. */
  | "ip_adapter"
  /** Instructional edit on a base plate (Qwen Image Edit, Flux Kontext). */
  | "instruction_edit"
  /** Low-denoise img2img continuity pass. */
  | "img2img_continuity"
  /** Optical crop+scale only. No diffusion. */
  | "optical_punch_in"
  /** Text only. No refs. */
  | "prompt_only"
  /** Operator dropped files from an external tool into an inbox. */
  | "external_import";

export type StillAspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";

/**
 * The unit of still work. Built from DiffuseCut canon (character angle paths,
 * location angle paths, shot camera sentence) with preprocess OFF by default.
 */
export type StillBrief = {
  id?: string;
  projectId: string;
  /** Human camera / action sentence. Keep it cinematic and concrete. */
  prompt: string;
  /** Optional negatives. Prefer empty unless the provider needs them. */
  negativePrompt?: string;
  aspectRatio: StillAspectRatio;
  refs: StillRef[];
  /**
   * Preferred technique. Provider may fall back and must report what it used.
   */
  technique?: StillTechnique;
  optionCount?: number;
  seed?: number;
  /**
   * When false (default), DiffuseCut must not rewrite the prompt through the
   * old shot/location preprocess soup. Style lock from project settings may
   * still append a short grade phrase if the operator opts in.
   */
  allowPromptPreprocess?: boolean;
  /** Free-form provider hints (model id, MJ version, fal endpoint, …). */
  providerOptions?: Record<string, unknown>;
};

export type StillOption = {
  id: string;
  localPath: string;
  width?: number;
  height?: number;
  seed?: number;
  /** Provider-reported technique actually used. */
  techniqueUsed: StillTechnique;
  /** Raw provider metadata for replay. */
  providerMeta?: Record<string, unknown>;
};

export type StillJobResult = {
  jobId: string;
  providerId: string;
  brief: StillBrief;
  status: "queued" | "running" | "completed" | "failed";
  options: StillOption[];
  errorMessage?: string;
  /**
   * Exact prompt string sent to the backend after any allowed append.
   * Required so evals can prove harness-off vs harness-on.
   */
  promptSent: string;
  createdAt: number;
  completedAt?: number;
};

export type StillProviderCapabilities = {
  id: string;
  label: string;
  kind: "local" | "cloud" | "import";
  techniques: StillTechnique[];
  maxRefs: number;
  requiresApiKey: boolean;
  /** True when this is the same model family Cursor GenerateImage has used. */
  cursorParityFamily?: boolean;
  notes?: string;
};

export type StillProviderContext = {
  /** Project media root for writing outputs. */
  outputDir: string;
  signal?: AbortSignal;
};

export interface StillProvider {
  readonly capabilities: StillProviderCapabilities;
  isAvailable(): Promise<boolean>;
  compose(
    brief: StillBrief,
    ctx: StillProviderContext
  ): Promise<StillJobResult>;
}

export type StillProviderId =
  | "local_comfy_thin"
  | "google_gemini_image"
  | "fal_flux"
  | "openai_images"
  | "replicate"
  | "midjourney_bridge"
  | "nightcafe"
  | "folder_import";
