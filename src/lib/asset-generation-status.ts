import { pipelineStageStatusLabel } from "@/lib/shot-pipeline-shared";
import type { AssetGenerationOption } from "@/lib/db/schema";

const CHARACTER_ISOLATE_NODE_LABELS: Record<string, string> = {
  "3": "Generating character on studio backdrop",
  "13": "Applying character reference (IP-Adapter)",
  "10": "Loading character reference",
  "5": "Preparing canvas",
  "8": "Decoding image",
  "9": "Saving character isolate",
};

const COMPOSITE_NODE_LABELS: Record<string, string> = {
  "40": "Loading rembg segmentation model",
  "41": "Cutting subject out of background",
  "43": "Preparing cutout for color match",
  "42": "Matching subject color to location plate",
  "21": "Blurring location plate",
  "22": "Scaling character layer",
  "31": "Softening subject mask edges",
  "25": "Expanding subject mask",
  "20": "Pasting subject onto location plate",
  "26": "Encoding composite for integration pass",
  "3": "Integration pass (img2img)",
  "14": "Applying character reference (IP-Adapter)",
  "10": "Loading character reference",
  "11": "Loading location plate",
  "18": "Loading character isolate",
  "8": "Decoding final image",
  "9": "Saving composite",
};

function nodeLabelMap(
  pipelineStage: AssetGenerationOption["pipelineStage"]
): Record<string, string> {
  if (pipelineStage === "character") return CHARACTER_ISOLATE_NODE_LABELS;
  if (pipelineStage === "composite") return COMPOSITE_NODE_LABELS;
  return {};
}

function findCharacterStageOption(
  compositeOption: AssetGenerationOption,
  allOptions: AssetGenerationOption[]
): AssetGenerationOption | null {
  if (!compositeOption.pipelineGroupId) return null;
  return (
    allOptions.find(
      (option) =>
        option.pipelineGroupId === compositeOption.pipelineGroupId &&
        option.pipelineStage === "character"
    ) ?? null
  );
}

export function resolveComfyNodeLabel(
  pipelineStage: AssetGenerationOption["pipelineStage"],
  nodeId: string | null | undefined
): string | null {
  if (!nodeId) return "Finalizing on ComfyUI";
  return nodeLabelMap(pipelineStage)[nodeId] ?? null;
}

export function formatAssetOptionStatusMessage(
  option: Pick<
    AssetGenerationOption,
    "pipelineStage" | "status" | "statusMessage" | "progress"
  >
): string {
  const stagePrefix = pipelineStageStatusLabel(option.pipelineStage);
  const raw = option.statusMessage?.trim();

  if (option.status === "queued") {
    return stagePrefix
      ? `${stagePrefix}: waiting to start`
      : "Waiting to start";
  }

  if (raw) {
    const executing = raw.match(/^Executing node (\d+)$/i);
    if (executing) {
      const friendly = resolveComfyNodeLabel(
        option.pipelineStage,
        executing[1] ?? null
      );
      if (friendly) {
        return stagePrefix ? `${stagePrefix}: ${friendly}` : friendly;
      }
    }

    const progress = raw.match(/^Progress (\d+)\/(\d+)$/i);
    if (progress) {
      const step = progress[1];
      const max = progress[2];
      const detail = `step ${step} of ${max}`;
      if (option.pipelineStage === "composite") {
        return `Stage 2/2: Integration pass, ${detail}`;
      }
      if (option.pipelineStage === "character") {
        return `Stage 1/2: Character isolate, ${detail}`;
      }
      return `Sampling, ${detail}`;
    }

    if (raw === "Generating on ComfyUI" && stagePrefix) {
      return `${stagePrefix}: working on ComfyUI`;
    }

    return stagePrefix ? `${stagePrefix}: ${raw}` : raw;
  }

  if (option.status === "running") {
    const pct = Math.round(option.progress * 100);
    return stagePrefix
      ? `${stagePrefix}: in progress (${pct}%)`
      : `In progress (${pct}%)`;
  }

  return "Waiting";
}

export type ShotOptionDisplayProgress = {
  statusMessage: string;
  progress: number;
  heartbeatAt: number | null;
  isActive: boolean;
  isStale: boolean;
};

export function resolveShotOptionDisplayProgress(
  option: AssetGenerationOption,
  allOptions: AssetGenerationOption[],
  nowMs: number = Date.now()
): ShotOptionDisplayProgress {
  if (option.pipelineStage === "composite" && option.status === "queued") {
    const characterStage = findCharacterStageOption(option, allOptions);
    if (
      characterStage &&
      (characterStage.status === "running" || characterStage.status === "queued")
    ) {
      return {
        statusMessage: formatAssetOptionStatusMessage(characterStage),
        progress: characterStage.progress,
        heartbeatAt: characterStage.lastHeartbeatAt,
        isActive: characterStage.status === "running",
        isStale: isLikelyStaleGenerationHeartbeat(characterStage, nowMs),
      };
    }
    if (characterStage?.status === "completed") {
      return {
        statusMessage: "Stage 2/2: waiting for ComfyUI queue",
        progress: Math.max(option.progress, 0.05),
        heartbeatAt: characterStage.completedAt ?? characterStage.lastHeartbeatAt,
        isActive: false,
        isStale: false,
      };
    }
  }

  return {
    statusMessage: formatAssetOptionStatusMessage(option),
    progress: option.progress,
    heartbeatAt: option.lastHeartbeatAt,
    isActive: option.status === "running",
    isStale: isLikelyStaleGenerationHeartbeat(option, nowMs),
  };
}

export function formatHeartbeatAge(
  lastHeartbeatAt: number | null | undefined,
  nowMs: number = Date.now()
): string | null {
  if (!lastHeartbeatAt) return null;
  const seconds = Math.max(0, Math.floor((nowMs - lastHeartbeatAt) / 1000));
  if (seconds < 5) return "updated just now";
  if (seconds < 60) return `updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `updated ${minutes}m ago`;
}

export function isLikelyStaleGenerationHeartbeat(
  option: Pick<AssetGenerationOption, "status" | "lastHeartbeatAt">,
  nowMs: number = Date.now(),
  staleAfterMs = 45_000
): boolean {
  if (option.status !== "running") return false;
  const heartbeat = option.lastHeartbeatAt;
  if (!heartbeat) return false;
  return nowMs - heartbeat > staleAfterMs;
}

export function summarizeShotBatchActivity(
  options: AssetGenerationOption[],
  nowMs: number = Date.now()
): string | null {
  const active = options.filter(
    (option) => option.status === "running" || option.status === "queued"
  );
  if (active.length === 0) return null;

  const running = active.filter((option) => option.status === "running");
  const current =
    running.find((option) => option.pipelineStage === "character") ??
    running.find((option) => option.pipelineStage === "composite") ??
    running[0] ??
    active[0];
  if (!current) return null;

  const optionLabel = `Option ${current.variantIndex + 1}`;
  const status = formatAssetOptionStatusMessage(current);
  const heartbeat = formatHeartbeatAge(current.lastHeartbeatAt, nowMs);

  const waitingCount = active.filter((option) => option.status === "queued").length;
  const queueHint =
    waitingCount > 0
      ? ` ${waitingCount} more job${waitingCount === 1 ? "" : "s"} queued on ComfyUI.`
      : "";

  return heartbeat
    ? `${optionLabel}: ${status}. ComfyUI ${heartbeat}.${queueHint}`
    : `${optionLabel}: ${status}.${queueHint}`;
}
