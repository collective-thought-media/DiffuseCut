import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import {
  defaultAppDataDir,
  getAppDataDir,
  isWritableDir,
  setCachedAppDataDir,
} from "@/lib/paths/app-paths";
import {
  getDefaultComfyuiEndpoints,
  getFfmpegPathSetting,
  getAppDataDirSetting,
} from "@/lib/services/settings";
import {
  getObjectInfo,
  getModels,
  normalizeUrl,
} from "@/lib/services/comfyui-client";
import { getScoreAudioSourceStatus } from "@/lib/services/score-audio-source";
import { getAceStepComputeStatus } from "@/lib/services/ace-step-compute";
import {
  CLIP_VISION_MODEL_HINT,
  IP_ADAPTER_MODEL_HINT,
  IP_ADAPTER_NODE_CLASSES,
  LTX_I2V_NODE_CLASSES,
  MINIMAX_I2V_NODE_CLASSES,
  hasModelMatching,
  missingNodeClasses,
  type ComfyModelFolders,
} from "@/lib/services/comfyui-workflow-requirements";
import type { DependencyStatus, DependencyStatusValue } from "@/types";

const execFileAsync = promisify(execFile);

function platformHint(base: {
  win: string;
  mac: string;
  linux: string;
}): string {
  if (process.platform === "win32") return base.win;
  if (process.platform === "darwin") return base.mac;
  return base.linux;
}

function comfyUnreachableStatus(
  id: DependencyStatus["id"],
  label: string,
  requiredFor: DependencyStatus["requiredFor"],
  comfyUrl: string
): DependencyStatus {
  const lastCheckedAt = Date.now();
  return {
    id,
    label,
    status: "unknown",
    requiredFor,
    message: `Start ComfyUI at ${comfyUrl} to verify`,
    installHint: "",
    lastCheckedAt,
  };
}

function checkNpmDeps(lastCheckedAt: number): DependencyStatus {
  const root = process.cwd();
  const nodeModules = path.join(root, "node_modules");
  const markers = ["next", "better-sqlite3", "drizzle-orm"];
  const missingMarkers = markers.filter(
    (name) => !fs.existsSync(path.join(nodeModules, name))
  );
  const ready = missingMarkers.length === 0;

  return {
    id: "npm_deps",
    label: "npm dependencies",
    status: ready ? "ok" : "missing",
    requiredFor: ["app"],
    message: ready
      ? "node_modules installed"
      : missingMarkers.length === markers.length
        ? "node_modules missing or empty"
        : `Missing packages: ${missingMarkers.join(", ")}`,
    installHint: "Run npm install in the project root",
    lastCheckedAt,
  };
}

async function loadComfyModelFolders(baseUrl: string): Promise<ComfyModelFolders> {
  const [
    checkpoints,
    ipadapter,
    clipVision,
    unet,
    vae,
    diffusionModels,
    textEncoders,
  ] = await Promise.all([
    getModels(baseUrl, "checkpoints"),
    getModels(baseUrl, "ipadapter").catch(() => [] as string[]),
    getModels(baseUrl, "clip_vision").catch(() => [] as string[]),
    getModels(baseUrl, "unet").catch(() => [] as string[]),
    getModels(baseUrl, "vae").catch(() => [] as string[]),
    getModels(baseUrl, "diffusion_models").catch(() => [] as string[]),
    getModels(baseUrl, "text_encoders").catch(() => [] as string[]),
  ]);

  return {
    checkpoints,
    ipadapter,
    clipVision,
    unet,
    vae,
    diffusionModels,
    textEncoders,
  };
}

async function checkFfmpeg(customPath?: string | null): Promise<DependencyStatus> {
  const ffmpegBin = customPath || "ffmpeg";
  const lastCheckedAt = Date.now();
  try {
    const { stdout } = await execFileAsync(ffmpegBin, ["-version"], {
      timeout: 5000,
    });
    const versionLine = stdout.split("\n")[0] ?? "FFmpeg detected";
    let ffprobeOk = true;
    try {
      const ffprobeBin = customPath
        ? customPath.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1")
        : "ffprobe";
      await execFileAsync(ffprobeBin, ["-version"], { timeout: 5000 });
    } catch {
      ffprobeOk = false;
    }
    return {
      id: "ffmpeg",
      label: "FFmpeg + ffprobe",
      status: ffprobeOk ? "ok" : "warning",
      requiredFor: ["export"],
      message: ffprobeOk ? versionLine : "FFmpeg found but ffprobe missing",
      installHint: platformHint({
        win: "winget install Gyan.FFmpeg, or download from https://ffmpeg.org",
        mac: "brew install ffmpeg",
        linux: "sudo apt install ffmpeg",
      }),
      docsUrl: "https://ffmpeg.org/download.html",
      detectedVersion: versionLine,
      lastCheckedAt,
    };
  } catch {
    return {
      id: "ffmpeg",
      label: "FFmpeg + ffprobe",
      status: "missing",
      requiredFor: ["export"],
      message: customPath
        ? `FFmpeg not found at ${customPath}`
        : "FFmpeg not found on PATH",
      installHint: platformHint({
        win: "winget install Gyan.FFmpeg",
        mac: "brew install ffmpeg",
        linux: "sudo apt install ffmpeg",
      }),
      docsUrl: "https://ffmpeg.org/download.html",
      lastCheckedAt,
    };
  }
}

async function checkComfyui(endpoints: string[]): Promise<DependencyStatus> {
  const lastCheckedAt = Date.now();
  const url = endpoints[0] ?? "http://127.0.0.1:8188";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${normalizeUrl(url)}/system_stats`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return {
        id: "comfyui",
        label: "ComfyUI render server",
        status: "missing",
        requiredFor: ["render"],
        message: `ComfyUI returned HTTP ${res.status} at ${url}`,
        installHint:
          "Install ComfyUI separately and start with: python main.py --listen 0.0.0.0 --port 8188",
        docsUrl: "https://github.com/comfyanonymous/ComfyUI",
        lastCheckedAt,
      };
    }
    const stats = (await res.json()) as { system?: { os?: string } };
    return {
      id: "comfyui",
      label: "ComfyUI render server",
      status: "ok",
      requiredFor: ["render"],
      message: `Connected to ${url}`,
      installHint: "",
      docsUrl: "https://github.com/comfyanonymous/ComfyUI",
      detectedVersion: stats.system?.os,
      lastCheckedAt,
    };
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? "Connection timed out"
        : "Connection refused or host unreachable";
    return {
      id: "comfyui",
      label: "ComfyUI render server",
      status: "missing",
      requiredFor: ["render"],
      message: `${msg} at ${url}`,
      installHint:
        "Start ComfyUI on your GPU machine. For LAN: python main.py --listen 0.0.0.0 --port 8188",
      docsUrl: "https://github.com/comfyanonymous/ComfyUI",
      lastCheckedAt,
    };
  }
}

function checkComfyuiCheckpoints(
  models: ComfyModelFolders,
  lastCheckedAt: number
): DependencyStatus {
  if (models.checkpoints.length === 0) {
    return {
      id: "comfyui_checkpoints",
      label: "SDXL checkpoints (character & location sheets)",
      status: "missing",
      requiredFor: ["render"],
      message: "No checkpoint models found on ComfyUI",
      installHint:
        "Add at least one SDXL .safetensors file to ComfyUI/models/checkpoints (e.g. RealVisXL).",
      docsUrl: "https://github.com/comfyanonymous/ComfyUI",
      lastCheckedAt,
    };
  }

  return {
    id: "comfyui_checkpoints",
    label: "SDXL checkpoints (character & location sheets)",
    status: "ok",
    requiredFor: ["render"],
    message: `${models.checkpoints.length} checkpoint(s) available`,
    installHint: "",
    detectedVersion: models.checkpoints.slice(0, 3).join(", "),
    lastCheckedAt,
  };
}

function checkComfyuiIpAdapter(
  objectInfo: Record<string, unknown>,
  models: ComfyModelFolders,
  lastCheckedAt: number
): DependencyStatus {
  const missingNodes = missingNodeClasses(objectInfo, IP_ADAPTER_NODE_CLASSES);
  const hasIpModel =
    models.ipadapter.length > 0 ||
    hasModelMatching(models.ipadapter, "ip-adapter");
  const hasClipVision =
    models.clipVision.length > 0 ||
    hasModelMatching(models.clipVision, "clip-vit-h");

  const issues: string[] = [];

  if (missingNodes.length > 0) {
    issues.push(`ComfyUI nodes not installed: ${missingNodes.join(", ")}`);
  }
  if (!hasIpModel) {
    issues.push(`IP-Adapter weights not found (${IP_ADAPTER_MODEL_HINT})`);
  }
  if (!hasClipVision) {
    issues.push(`CLIP vision weights not found (${CLIP_VISION_MODEL_HINT})`);
  }

  const ready = issues.length === 0;

  return {
    id: "comfyui_ipadapter",
    label: "IP-Adapter (anchored location angles, optional)",
    status: ready ? "ok" : "info",
    optional: !ready,
    requiredFor: ["render"],
    message: ready
      ? "IP-Adapter ready for anchored location angles"
      : issues.join("; "),
    installHint: ready
      ? ""
      : "Optional. Without IP-Adapter, location angles and storyboard frames still generate from prompts. Install ComfyUI_IPAdapter_plus for reference-guided set matching.",
    docsUrl: "https://github.com/cubiq/ComfyUI_IPAdapter_plus",
    lastCheckedAt,
  };
}

function hasMinimaxI2vStack(
  objectInfo: Record<string, unknown>,
  models: ComfyModelFolders
): { ready: boolean; issues: string[] } {
  const missingNodes = missingNodeClasses(objectInfo, MINIMAX_I2V_NODE_CLASSES);
  const hasVideoModels =
    models.unet.some((name) => name.toLowerCase().includes("minimax")) ||
    models.diffusionModels.some((name) =>
      name.toLowerCase().includes("minimax")
    );
  const hasVae = models.vae.some((name) =>
    name.toLowerCase().includes("minimax_h3_video")
  );
  const hasTextEncoder = models.textEncoders.some((name) =>
    name.toLowerCase().includes("minimax")
  );

  const issues: string[] = [];
  if (missingNodes.length > 0) {
    issues.push(`ComfyUI nodes not installed: ${missingNodes.join(", ")}`);
  }
  if (!hasVideoModels || !hasVae || !hasTextEncoder) {
    issues.push("MiniMax H3 model weights not detected in ComfyUI folders");
  }
  return { ready: issues.length === 0, issues };
}

function checkComfyuiMinimaxI2v(
  objectInfo: Record<string, unknown>,
  models: ComfyModelFolders,
  lastCheckedAt: number
): DependencyStatus {
  const { ready, issues } = hasMinimaxI2vStack(objectInfo, models);

  return {
    id: "comfyui_minimax_i2v",
    label: "MiniMax H3 image-to-video (optional)",
    status: ready ? "ok" : "info",
    optional: !ready,
    requiredFor: ["render"],
    message: ready
      ? "MiniMax H3 I2V stack detected for shot video renders"
      : issues.join("; "),
    installHint: ready
      ? ""
      : "Optional. Install only if you select the MiniMax template on Render. Requires ComfyUI 0.30+ and MiniMax H3 weights from Comfy-Org/MiniMax-H3.",
    docsUrl: "https://docs.comfy.org/tutorials/video/minimax/minimax-h3",
    lastCheckedAt,
  };
}

function hasLtxI2vStack(
  objectInfo: Record<string, unknown>,
  models: ComfyModelFolders
): { ready: boolean; issues: string[] } {
  const missingNodes = missingNodeClasses(objectInfo, LTX_I2V_NODE_CLASSES);
  const hasLtxWeights =
    models.unet.some((name) => name.toLowerCase().includes("ltx")) ||
    models.checkpoints.some((name) => name.toLowerCase().includes("ltx")) ||
    models.vae.some((name) => name.toLowerCase().includes("ltx"));

  const issues: string[] = [];
  if (missingNodes.length > 0) {
    issues.push(`ComfyUI nodes not installed: ${missingNodes.join(", ")}`);
  }
  if (!hasLtxWeights) {
    issues.push("LTX model weights not detected in ComfyUI folders");
  }
  return { ready: issues.length === 0, issues };
}

function checkComfyuiLtxI2v(
  objectInfo: Record<string, unknown>,
  models: ComfyModelFolders,
  lastCheckedAt: number
): DependencyStatus {
  const { ready, issues } = hasLtxI2vStack(objectInfo, models);

  return {
    id: "comfyui_ltx_i2v",
    label: "LTX 2.3 image-to-video (optional)",
    status: ready ? "ok" : "info",
    optional: !ready,
    requiredFor: ["render"],
    message: ready
      ? "LTX 2.3 I2V stack detected for shot video renders"
      : issues.join("; "),
    installHint: ready
      ? ""
      : "Optional. Install only if you select the LTX template on Render. Requires a ComfyUI build with LTX 2.3 nodes and matching checkpoints, VAE, and UNET weights.",
    docsUrl: "https://docs.comfy.org",
    lastCheckedAt,
  };
}

async function checkComfyuiAceStep(
  _objectInfo: Record<string, unknown>,
  _models: ComfyModelFolders,
  lastCheckedAt: number
): Promise<DependencyStatus> {
  const compute = await getAceStepComputeStatus();
  const ready = compute.ready;

  return {
    id: "comfyui_ace_step",
    label: "ACE-Step 1.5 music generation (optional)",
    status: ready ? "ok" : "info",
    optional: !ready,
    requiredFor: ["finishing"],
    message: compute.message,
    installHint: ready
      ? ""
        : compute.mode === "remote"
        ? "Optional. Set the LAN ComfyUI URL (http://GPU-IP:8188) in Settings, or start the native API with start-ace-step-api.ps1."
        : "Optional. Run scripts/local-dev/install-ace-step-local.ps1 from the DiffuseCut repo, or upload your own score on Finishing.",
    docsUrl: "https://github.com/ACE-Step/ACE-Step-1.5",
    detectedVersion:
      compute.remoteUrl ??
      compute.localInstallDir ??
      (compute.ready ? "ready" : undefined),
    lastCheckedAt,
  };
}

async function checkScoreAudio(): Promise<DependencyStatus> {
  const lastCheckedAt = Date.now();
  const source = await getScoreAudioSourceStatus();

  const paths: string[] = ["Upload your own score file"];
  if (source.aceStepReady) {
    paths.unshift(
      source.aceStepComputeMode === "remote"
        ? "Remote ACE-Step 1.5"
        : "Local ACE-Step 1.5"
    );
  }
  if (source.elevenLabsConfigured) paths.push("ElevenLabs");

  const message =
    source.provider === "upload"
      ? "Upload your own score on Finishing. Generation is disabled in Settings."
      : paths.length > 1
        ? `Available: ${paths.join(", ")}. Provider: ${source.provider}.`
        : "Upload your own score on Finishing, or install ACE-Step / add ElevenLabs in Settings.";

  return {
    id: "score_audio",
    label: "Musical score source (optional)",
    status: "ok",
    requiredFor: ["finishing"],
    message,
    installHint:
      source.aceStepReady || source.elevenLabsConfigured
        ? ""
        : "Upload your own score on Finishing, or install ACE-Step / ElevenLabs in Settings.",
    docsUrl: "https://docs.comfy.org/tutorials/audio/ace-step/ace-step-v1-5",
    detectedVersion: paths.join(" | "),
    lastCheckedAt,
  };
}

async function checkComfyuiWorkflowDeps(
  comfyuiStatus: DependencyStatus,
  endpoints: string[]
): Promise<DependencyStatus[]> {
  const url = endpoints[0] ?? "http://127.0.0.1:8188";
  const lastCheckedAt = Date.now();

  if (comfyuiStatus.status !== "ok") {
    return [
      comfyUnreachableStatus(
        "comfyui_checkpoints",
        "SDXL checkpoints (character & location sheets)",
        ["render"],
        url
      ),
      comfyUnreachableStatus(
        "comfyui_ipadapter",
        "IP-Adapter (anchored location angles, optional)",
        ["render"],
        url
      ),
      comfyUnreachableStatus(
        "comfyui_ltx_i2v",
        "LTX 2.3 image-to-video (optional)",
        ["render"],
        url
      ),
      comfyUnreachableStatus(
        "comfyui_minimax_i2v",
        "MiniMax H3 image-to-video (optional)",
        ["render"],
        url
      ),
    ];
  }

  try {
    const baseUrl = normalizeUrl(url);
    const [objectInfo, models] = await Promise.all([
      getObjectInfo(baseUrl),
      loadComfyModelFolders(baseUrl),
    ]);

    return [
      checkComfyuiCheckpoints(models, lastCheckedAt),
      checkComfyuiIpAdapter(objectInfo, models, lastCheckedAt),
      checkComfyuiLtxI2v(objectInfo, models, lastCheckedAt),
      checkComfyuiMinimaxI2v(objectInfo, models, lastCheckedAt),
    ];
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not query ComfyUI capabilities";
    const fallback = (
      id: DependencyStatus["id"],
      label: string,
      requiredFor: DependencyStatus["requiredFor"],
      optional = false
    ): DependencyStatus => ({
      id,
      label,
      status: optional ? "info" : "warning",
      optional,
      requiredFor,
      message,
      installHint: "Confirm ComfyUI is running and reachable from DiffuseCut.",
      lastCheckedAt,
    });

    return [
      fallback(
        "comfyui_checkpoints",
        "SDXL checkpoints (character & location sheets)",
        ["render"]
      ),
      fallback(
        "comfyui_ipadapter",
        "IP-Adapter (anchored location angles, optional)",
        ["render"],
        true
      ),
      fallback(
        "comfyui_ltx_i2v",
        "LTX 2.3 image-to-video (optional)",
        ["render"],
        true
      ),
      fallback(
        "comfyui_minimax_i2v",
        "MiniMax H3 image-to-video (optional)",
        ["render"],
        true
      ),
    ];
  }
}

export async function checkAllDependencies(): Promise<DependencyStatus[]> {
  const appDataSetting = await getAppDataDirSetting();
  if (appDataSetting) setCachedAppDataDir(appDataSetting);

  const appDataDir = getAppDataDir();
  const writable = isWritableDir(appDataDir);
  const lastCheckedAt = Date.now();

  const nodeMajor = parseInt(process.version.slice(1).split(".")[0] ?? "0", 10);
  const nodeStatus: DependencyStatus = {
    id: "node",
    label: "Node.js",
    status: nodeMajor >= 20 ? "ok" : "warning",
    requiredFor: ["app"],
    message:
      nodeMajor >= 20
        ? `Node ${process.version}`
        : `Node ${process.version}. Recommend 20+.`,
    installHint: "Install Node.js 20 LTS from https://nodejs.org",
    detectedVersion: process.version,
    lastCheckedAt,
  };

  const npmStatus = checkNpmDeps(lastCheckedAt);

  const appDataStatus: DependencyStatus = {
    id: "app_data_dir",
    label: "App data directory",
    status: writable ? "ok" : "missing",
    requiredFor: ["app"],
    message: writable
      ? `Writable: ${appDataDir}`
      : `Cannot write to ${appDataDir}`,
    installHint: writable
      ? ""
      : `Choose a writable folder in Settings (default: ${defaultAppDataDir()})`,
    lastCheckedAt,
  };

  const ffmpegPath = await getFfmpegPathSetting();
  const ffmpegStatus = await checkFfmpeg(ffmpegPath);
  const endpoints = await getDefaultComfyuiEndpoints();
  const comfyuiStatus = await checkComfyui(endpoints);
  const comfyWorkflowStatuses = await checkComfyuiWorkflowDeps(
    comfyuiStatus,
    endpoints
  );
  const scoreAudioStatus = await checkScoreAudio();
  const aceStepStatus = await checkComfyuiAceStep({}, {} as ComfyModelFolders, Date.now());

  return [
    nodeStatus,
    npmStatus,
    appDataStatus,
    ffmpegStatus,
    aceStepStatus,
    comfyuiStatus,
    ...comfyWorkflowStatuses,
    scoreAudioStatus,
  ];
}

export function formatDependencySummary(deps: DependencyStatus[]): string {
  return deps
    .map((d) => {
      const icon =
        d.status === "ok" ? "✓" : d.status === "info" ? "○" : d.status === "warning" ? "!" : "✗";
      return `${d.label} ${icon}`;
    })
    .join(" | ");
}

export async function assertDependency(
  id: DependencyStatus["id"],
  deps?: DependencyStatus[]
): Promise<void> {
  const list = deps ?? (await checkAllDependencies());
  const dep = list.find((d) => d.id === id);
  if (!dep || dep.status === "ok" || dep.status === "info") return;
  if (dep.status === "warning" && id === "node") return;
  const { DependencyMissingError } = await import("@/types");
  throw new DependencyMissingError(dep.id, dep.installHint);
}
