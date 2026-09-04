"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { GenerationStack } from "@/types";
import type { RenderSettings } from "@/types";
import { Button, Label, Select } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function shortCheckpoint(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(/\.(safetensors|ckpt|pt)$/i, "");
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
  const [selectedCheckpoint, setSelectedCheckpoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(readStoredExpanded);
  const onReadyChangeRef = useRef(onReadyChange);
  const onStackChangeRef = useRef(onStackChange);

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
    onStackChangeRef.current = onStackChange;
  }, [onReadyChange, onStackChange]);

  const applyStack = useCallback((nextStack: GenerationStack | null) => {
    setStack(nextStack);
    onStackChangeRef.current?.(nextStack);
    if (!nextStack) {
      onReadyChangeRef.current?.(false);
      return;
    }
    const ready =
      nextStack.comfyuiReachable &&
      nextStack.availableCheckpoints.length > 0 &&
      Boolean(
        nextStack.configuredCheckpoint &&
          nextStack.availableCheckpoints.includes(nextStack.configuredCheckpoint)
      );
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
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load generation stack");
        }
        const nextStack = data.stack as GenerationStack;
        applyStack(nextStack);
        setSelectedCheckpoint(
          nextStack.configuredCheckpoint ??
            nextStack.effectiveCheckpoint ??
            nextStack.availableCheckpoints[0] ??
            ""
        );
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

  async function saveCheckpoint(checkpoint: string) {
    if (!checkpoint) return;
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const settingsRes = await fetch(
        `/api/projects/${projectId}/render-settings`
      );
      const settingsData = await settingsRes.json();
      if (!settingsRes.ok) {
        throw new Error(settingsData.error ?? "Failed to load render settings");
      }
      const existing = (settingsData.renderSettings ?? {}) as RenderSettings;

      const res = await fetch(`/api/projects/${projectId}/render-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renderSettings: { ...existing, checkpoint },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save checkpoint");

      if (stack) {
        applyStack({
          ...stack,
          configuredCheckpoint: checkpoint,
          effectiveCheckpoint: checkpoint,
          needsCheckpointSelection: false,
        });
      }
      setSavedMessage("Checkpoint saved for this project.");
      void loadStack({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save checkpoint");
    } finally {
      setSaving(false);
    }
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
  const checkpointName =
    stack.configuredCheckpoint ?? stack.effectiveCheckpoint ?? "";
  const loraSummary =
    stack.loras.length > 0
      ? stack.loras.map((lora) => lora.name).join(", ")
      : null;

  const summaryParts = [
    checkpointName ? shortCheckpoint(checkpointName) : null,
    shortSampler(stack),
    workflowName,
    shortEndpoint(stack.endpointUrl),
    loraSummary ? `LoRA: ${loraSummary}` : null,
  ].filter(Boolean);

  const showCompactSummary = batchActive && !detailsExpanded;

  const checkpointGate =
    stack.availableCheckpoints.length === 0 ? (
      <p className="text-sm text-amber-200/90">
        No checkpoint models found on ComfyUI. Install at least one checkpoint
        in models/checkpoints, then refresh this page.
      </p>
    ) : stack.needsCheckpointSelection ? (
      <div className="space-y-2 rounded-lg border border-amber-500/30 bg-neutral-950 p-4">
        <Label htmlFor="stack-checkpoint">Checkpoint (required before generating)</Label>
        <Select
          id="stack-checkpoint"
          value={selectedCheckpoint}
          onChange={(e) => setSelectedCheckpoint(e.target.value)}
        >
          {stack.availableCheckpoints.map((checkpoint) => (
            <option key={checkpoint} value={checkpoint}>
              {checkpoint}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          {stack.configuredCheckpoint &&
          !stack.availableCheckpoints.includes(stack.configuredCheckpoint)
            ? `Saved checkpoint "${stack.configuredCheckpoint}" is not on this ComfyUI server. Pick one from the list.`
            : "Choose the checkpoint to use for this project's ComfyUI jobs."}
        </p>
        <Button
          type="button"
          size="sm"
          disabled={!selectedCheckpoint || saving}
          onClick={() => void saveCheckpoint(selectedCheckpoint)}
        >
          {saving ? "Saving…" : "Save checkpoint"}
        </Button>
        {savedMessage && (
          <p className="text-xs text-emerald-400">{savedMessage}</p>
        )}
      </div>
    ) : null;

  const settingsSummary = (
    <div className="space-y-2">
      {!stack.comfyuiReachable && (
        <p className="text-sm text-amber-200/90">
          ComfyUI is not reachable at {stack.endpointUrl}. Check{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>
          .
        </p>
      )}

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
              Edit image settings
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
            {checkpointName && (
              <StackDetailRow
                label="Checkpoint"
                value={checkpointName}
                mono
              />
            )}
          </dl>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {!stack.needsCheckpointSelection &&
        stack.availableCheckpoints.length > 0 &&
        !stack.configuredCheckpoint && (
          <p className="text-xs text-muted-foreground">
            Save a checkpoint above before generating.
          </p>
        )}
    </div>
  );

  return children({
    checkpointGate,
    settingsSummary,
    loading: false,
  });
}
