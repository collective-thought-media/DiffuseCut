"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { GenerationStack } from "@/types";
import { ImageModelPicker } from "@/components/render/ImageModelPicker";
import {
  isIpAdapterFriendlyCheckpoint,
  shortCheckpointLabel,
} from "@/lib/services/image-checkpoints";
import { cn } from "@/lib/utils";
import { parseApiResponse } from "@/lib/parse-api-response";

const STACK_EXPANDED_STORAGE_KEY = "diffusecut-generation-stack-expanded";

export interface ComfyuiGenerationStackSlots {
  checkpointGate: ReactNode;
  settingsSummary: ReactNode;
  loading: boolean;
}

interface ComfyuiGenerationStackProps {
  projectId: string;
  onReadyChange?: (ready: boolean) => void;
  onStackChange?: (stack: GenerationStack | null) => void;
  workflowNameOverride?: string;
  batchActive?: boolean;
  children: (slots: ComfyuiGenerationStackSlots) => ReactNode;
}

function shortEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] ?? url;
  }
}

function shortSampler(stack: GenerationStack): string {
  const steps = stack.sampler.steps ?? 24;
  const cfg = stack.sampler.cfg ?? 7.5;
  const sampler = stack.sampler.sampler_name ?? "euler";
  return `${steps} steps, CFG ${cfg}, ${sampler}`;
}

function readStoredExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STACK_EXPANDED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function StackDetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm",
          mono && "font-mono text-xs"
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

export function ComfyuiGenerationStack({
  projectId,
  onReadyChange,
  onStackChange,
  workflowNameOverride,
  batchActive = false,
  children,
}: ComfyuiGenerationStackProps) {
  const [stack, setStack] = useState<GenerationStack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(readStoredExpanded);
  const onReadyChangeRef = useRef(onReadyChange);
  const onStackChangeRef = useRef(onStackChange);

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
    onStackChangeRef.current = onStackChange;
  }, [onReadyChange, onStackChange]);

  const imageCheckpoints =
    stack?.availableImageCheckpoints ?? stack?.availableCheckpoints ?? [];

  const applyStack = useCallback((nextStack: GenerationStack | null) => {
    setStack(nextStack);
    onStackChangeRef.current?.(nextStack);
    if (!nextStack) {
      onReadyChangeRef.current?.(false);
      return;
    }
    const pool =
      nextStack.availableImageCheckpoints.length > 0
        ? nextStack.availableImageCheckpoints
        : nextStack.availableCheckpoints;
    const usingKrea = nextStack.imageEngine === "krea2";
    const ready =
      nextStack.comfyuiReachable &&
      (usingKrea
        ? nextStack.krea2Available && Boolean(nextStack.effectiveImageUnet)
        : pool.length > 0 &&
          Boolean(
            nextStack.configuredCheckpoint &&
              pool.includes(nextStack.configuredCheckpoint)
          ));
    onReadyChangeRef.current?.(ready);
  }, []);

  const loadStack = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/generation-stack`);
        const data = await parseApiResponse<{ stack: GenerationStack; error?: string }>(
          res
        );
        const nextStack = data.stack;
        applyStack(nextStack);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stack");
        applyStack(null);
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [projectId, applyStack]
  );

  useEffect(() => {
    void loadStack();
  }, [loadStack]);

  useEffect(() => {
    if (batchActive && !readStoredExpanded()) {
      setDetailsExpanded(false);
    }
  }, [batchActive]);

  function toggleDetailsExpanded() {
    setDetailsExpanded((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(
          STACK_EXPANDED_STORAGE_KEY,
          next ? "true" : "false"
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function handleCheckpointSaved(checkpoint: string, engine: "sdxl" | "krea2") {
    if (!stack) return;
    applyStack({
      ...stack,
      configuredCheckpoint: engine === "krea2" ? stack.configuredCheckpoint : checkpoint,
      effectiveCheckpoint: engine === "krea2" ? stack.effectiveCheckpoint : checkpoint,
      imageEngine: engine,
      needsCheckpointSelection: false,
    });
    void loadStack({ silent: true });
  }

  if (loading) {
    return children({
      checkpointGate: null,
      settingsSummary: (
        <p className="text-xs text-muted-foreground">Loading generation settings…</p>
      ),
      loading: true,
    });
  }

  if (!stack) {
    return children({
      checkpointGate: null,
      settingsSummary: error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null,
      loading: false,
    });
  }

  const workflowName = workflowNameOverride ?? stack.workflowTemplateName;
  const usingKrea = stack.imageEngine === "krea2";
  const checkpointName = usingKrea
    ? stack.effectiveImageUnet ?? "Krea 2 turbo"
    : stack.configuredCheckpoint ?? stack.effectiveCheckpoint ?? "";
  const loraSummary =
    stack.loras.length > 0
      ? stack.loras.map((lora) => lora.name).join(", ")
      : null;

  const summaryParts = [
    checkpointName ? shortCheckpointLabel(checkpointName) : null,
    shortSampler(stack),
    workflowName,
    shortEndpoint(stack.endpointUrl),
    loraSummary ? `LoRA: ${loraSummary}` : null,
  ].filter(Boolean);

  const showCompactSummary = batchActive && !detailsExpanded;

  const usesIpAdapterWorkflow = Boolean(
    workflowNameOverride?.toLowerCase().includes("ip-adapter")
  );
  const ipAdapterCheckpointWarning =
    usesIpAdapterWorkflow &&
    !usingKrea &&
    checkpointName &&
    !isIpAdapterFriendlyCheckpoint(checkpointName)
      ? `Reference-guided shots auto-switch to EpicRealism XL (or similar). ${shortCheckpointLabel(checkpointName)} often produces splotchy output with IP-Adapter.`
      : null;

  const imageModelPicker = (
    <ImageModelPicker
      projectId={projectId}
      checkpoints={imageCheckpoints}
      imageEngine={stack.imageEngine}
      krea2Available={stack.krea2Available}
      value={
        usingKrea
          ? checkpointName
          : checkpointName && imageCheckpoints.includes(checkpointName)
            ? checkpointName
            : imageCheckpoints[0] ?? ""
      }
      autoSave
      compact={showCompactSummary}
      onSaved={handleCheckpointSaved}
      className={
        !usingKrea &&
        stack.configuredCheckpoint &&
        !imageCheckpoints.includes(stack.configuredCheckpoint)
          ? "rounded-lg border border-amber-500/30 bg-neutral-950 p-3"
          : undefined
      }
    />
  );

  const settingsSummary = (
    <div className="space-y-3">
      {!stack.comfyuiReachable && (
        <p className="text-sm text-amber-200/90">
          ComfyUI is not reachable at {stack.endpointUrl}. Check{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>
          .
        </p>
      )}

      {!usingKrea &&
        stack.configuredCheckpoint &&
        !imageCheckpoints.includes(stack.configuredCheckpoint) && (
          <p className="text-xs text-amber-200/90">
            Saved model &quot;{stack.configuredCheckpoint}&quot; is not on this
            ComfyUI server. Pick a model below.
          </p>
        )}

      {imageModelPicker}

      {ipAdapterCheckpointWarning ? (
        <p className="text-xs text-amber-200/90">{ipAdapterCheckpointWarning}</p>
      ) : null}

      <div className="rounded-lg bg-neutral-950/80 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {showCompactSummary ? (
              <span title={summaryParts.join(" · ")}>
                Using{" "}
                <span className="text-foreground/80">
                  {summaryParts.slice(0, 3).join(" · ")}
                </span>
                {summaryParts.length > 3 ? " · …" : ""}
              </span>
            ) : (
              <span className="text-foreground/80">{summaryParts.join(" · ")}</span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={toggleDetailsExpanded}
              className="text-xs text-primary hover:underline"
            >
              {detailsExpanded ? "Hide details" : "Show details"}
            </button>
            <Link
              href={`/projects/${projectId}/render#image-generation`}
              className="text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              More image settings
            </Link>
          </div>
        </div>

        {detailsExpanded && (
          <dl className="mt-3 grid gap-2 border-t border-neutral-800 pt-3 sm:grid-cols-2">
            <StackDetailRow label="Workflow" value={workflowName} />
            <StackDetailRow
              label="Endpoint"
              value={stack.endpointUrl}
              mono
            />
            <StackDetailRow label="Sampler" value={shortSampler(stack)} />
            <StackDetailRow
              label="LoRAs"
              value={
                stack.loras.length > 0
                  ? stack.loras
                      .map((lora) => `${lora.name} (${lora.strength})`)
                      .join(", ")
                  : "None configured"
              }
            />
          </dl>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );

  return children({
    checkpointGate: null,
    settingsSummary,
    loading: false,
  });
}
