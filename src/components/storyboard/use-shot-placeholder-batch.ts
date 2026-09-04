"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssetGenerationBatch,
  AssetGenerationOption,
} from "@/lib/db/schema";
import type { ShotPlaceholderPack } from "@/lib/services/shot-asset-generation";
import { formatComfyuiError } from "@/lib/services/comfyui-errors";
import {
  mergeShotRenderOverrides,
  parseShotRenderOverrides,
  serializeShotRenderOverrides,
} from "@/lib/shot-render-overrides";

export function formatShotBatchFailureMessage(
  batch: AssetGenerationBatch,
  options: AssetGenerationOption[]
): string {
  const optionErrors = [
    ...new Set(
      options
        .map((option) => option.errorMessage)
        .filter((message): message is string => Boolean(message))
    ),
  ];
  const primary =
    optionErrors[0] ?? batch.errorMessage ?? "Generation failed";
  if (optionErrors.length <= 1) {
    return formatComfyuiError(primary);
  }
  return formatComfyuiError(
    [primary, ...optionErrors.slice(1)].join("\n\n")
  );
}

export function formatShotPlaceholderPackLabel(pack: ShotPlaceholderPack): string {
  const suffix = pack.isLatest ? " (latest)" : "";
  if (pack.batch.status === "archived") {
    return `Pack ${pack.packNumber}${suffix}`;
  }
  return `Pack ${pack.packNumber}${suffix}`;
}

type BatchView = {
  batch?: AssetGenerationBatch | null;
  options?: AssetGenerationOption[];
  packs?: ShotPlaceholderPack[];
  activeBatchId?: string | null;
};

export interface UseShotPlaceholderBatchProps {
  projectId: string;
  shotId: string;
  shotTitle: string;
  placeholderDescription: string;
  hasPlaceholder?: boolean;
  renderOverridesJson?: string | null;
  hasLocationReference?: boolean;
  onRenderOverridesChange?: (renderOverridesJson: string | null) => void;
  onPlaceholderSelected: (shot: {
    id: string;
    placeholderPath: string | null;
    placeholderKind: "image" | "video" | null;
    updatedAt: number;
  }) => void | Promise<void>;
}

export function useShotPlaceholderBatch({
  projectId,
  shotId,
  shotTitle,
  placeholderDescription,
  hasPlaceholder = false,
  renderOverridesJson,
  hasLocationReference = false,
  onRenderOverridesChange,
  onPlaceholderSelected,
}: UseShotPlaceholderBatchProps) {
  const [batch, setBatch] = useState<AssetGenerationBatch | null>(null);
  const [options, setOptions] = useState<AssetGenerationOption[]>([]);
  const [packs, setPacks] = useState<ShotPlaceholderPack[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [viewingBatchId, setViewingBatchId] = useState<string | null>(null);
  const viewingBatchIdRef = useRef<string | null>(null);
  const [sampleCount, setSampleCount] = useState(3);
  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [negativePreview, setNegativePreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [comfyuiOk, setComfyuiOk] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [stackReady, setStackReady] = useState(false);
  const [ipAdapterAvailable, setIpAdapterAvailable] = useState<boolean | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!hasPlaceholder);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );

  const apiBase = useMemo(
    () => `/api/projects/${projectId}/shots/${shotId}`,
    [projectId, shotId]
  );

  const applyBatchView = useCallback(
    (view: BatchView, preferBatchId?: string | null) => {
      const nextPacks = view.packs ?? [];
      setPacks(nextPacks);
      setActiveBatchId(view.activeBatchId ?? null);

      const targetId =
        preferBatchId ??
        viewingBatchIdRef.current ??
        view.activeBatchId ??
        view.batch?.id ??
        nextPacks[nextPacks.length - 1]?.batch.id ??
        null;

      const pack = targetId
        ? nextPacks.find((item) => item.batch.id === targetId)
        : null;

      if (pack) {
        viewingBatchIdRef.current = pack.batch.id;
        setViewingBatchId(pack.batch.id);
        setBatch(pack.batch);
        setOptions(pack.options);
        return;
      }

      if (view.batch) {
        viewingBatchIdRef.current = view.batch.id;
        setViewingBatchId(view.batch.id);
        setBatch(view.batch);
        setOptions(view.options ?? []);
        return;
      }

      viewingBatchIdRef.current = null;
      setViewingBatchId(null);
      setBatch(null);
      setOptions([]);
    },
    []
  );

  const loadBatch = useCallback(
    async (batchId?: string | null) => {
      try {
        const url = batchId
          ? `${apiBase}/placeholder-batch?batchId=${encodeURIComponent(batchId)}`
          : `${apiBase}/placeholder-batch`;
        const res = await fetch(url);
        if (res.status === 404) {
          viewingBatchIdRef.current = null;
          setViewingBatchId(null);
          setBatch(null);
          setOptions([]);
          setPacks([]);
          setActiveBatchId(null);
          setError(null);
          return;
        }
        const data = (await res.json()) as BatchView;
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error ?? "Failed to load batch"
          );
        }
        applyBatchView(data, batchId);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load batch");
      }
    },
    [apiBase, applyBatchView]
  );

  const stillNegativePrompt = parseShotRenderOverrides(renderOverridesJson)
    .stillNegativePrompt;

  const loadPromptPreview = useCallback(async () => {
    if (!shotTitle.trim() || !placeholderDescription.trim()) {
      setPreviewError(
        "Add a shot prompt, location, or character cast before previewing."
      );
      setPromptPreview(null);
      setNegativePreview(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const params = new URLSearchParams({
        title: shotTitle,
        description: placeholderDescription,
        projectId,
        shotId,
      });
      if (hasLocationReference) {
        params.set("hasLocationReference", "1");
      }
      const res = await fetch(
        `/api/prompt-preview/shot-placeholder?${params.toString()}`
      );
      const data = (await res.json()) as {
        processedPrompt?: string;
        negativePrompt?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load prompt preview");
      }
      setPromptPreview(data.processedPrompt ?? null);
      setNegativePreview(data.negativePrompt ?? null);
    } catch (err) {
      setPromptPreview(null);
      setNegativePreview(null);
      setPreviewError(
        err instanceof Error ? err.message : "Failed to load prompt preview"
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [
    shotTitle,
    placeholderDescription,
    projectId,
    shotId,
    hasLocationReference,
  ]);

  const togglePromptPreview = useCallback(() => {
    setShowPreview((open) => {
      const next = !open;
      if (next) {
        void loadPromptPreview();
      }
      return next;
    });
  }, [loadPromptPreview]);

  const handleStillNegativePromptChange = useCallback(
    (value: string) => {
      const next = serializeShotRenderOverrides(
        mergeShotRenderOverrides(parseShotRenderOverrides(renderOverridesJson), {
          stillNegativePrompt: value,
        })
      );
      onRenderOverridesChange?.(next);
    },
    [renderOverridesJson, onRenderOverridesChange]
  );

  useEffect(() => {
    void loadBatch();
  }, [loadBatch, shotId]);

  useEffect(() => {
    if (showPreview) void loadPromptPreview();
  }, [showPreview, loadPromptPreview, stillNegativePrompt]);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`${apiBase}/placeholder-batch/stream`);

      es.onmessage = (event) => {
        try {
          const view = JSON.parse(event.data) as BatchView;
          const nextPacks = view.packs ?? [];
          setPacks(nextPacks);
          setActiveBatchId(view.activeBatchId ?? null);

          const viewId = viewingBatchIdRef.current;
          const viewedPack = viewId
            ? nextPacks.find((pack) => pack.batch.id === viewId)
            : null;

          if (viewedPack) {
            setBatch(viewedPack.batch);
            setOptions(viewedPack.options);
            return;
          }

          if (view.activeBatchId) {
            const activePack = nextPacks.find(
              (pack) => pack.batch.id === view.activeBatchId
            );
            if (activePack) {
              viewingBatchIdRef.current = activePack.batch.id;
              setViewingBatchId(activePack.batch.id);
              setBatch(activePack.batch);
              setOptions(activePack.options);
              return;
            }
          }

          if (nextPacks.length === 0 && !submittingRef.current) {
            viewingBatchIdRef.current = null;
            setViewingBatchId(null);
            setBatch(null);
            setOptions([]);
            setError(null);
          }
        } catch {
          /* ignore */
        }
      };

      es.onerror = () => {
        es?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [apiBase]);

  const selectPack = useCallback(
    (batchId: string) => {
      const pack = packs.find((item) => item.batch.id === batchId);
      if (pack) {
        viewingBatchIdRef.current = pack.batch.id;
        setViewingBatchId(pack.batch.id);
        setBatch(pack.batch);
        setOptions(pack.options);
        return;
      }
      void loadBatch(batchId);
    },
    [packs, loadBatch]
  );

  async function handleGenerate(replace = false) {
    if (replace) {
      const message =
        "Start a new generation pack? Previous packs stay saved so you can compare and pick from any of them.";
      if (!confirm(message)) return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    try {
      const res = await fetch(`${apiBase}/generate-placeholders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: sampleCount, replace }),
      });
      const data = (await res.json()) as BatchView & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setError(null);
      applyBatchView(data, data.activeBatchId ?? data.batch?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleSelect(optionId: string) {
    if (
      !confirm(
        "Use this image as the shot placeholder? You can switch to another option later."
      )
    ) {
      return;
    }
    setSelectingId(optionId);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/select-placeholder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      const data = (await res.json()) as BatchView & {
        error?: string;
        shot?: {
          id: string;
          placeholderPath: string | null;
          placeholderKind: "image" | "video" | null;
          updatedAt: number;
        };
      };
      if (!res.ok) throw new Error(data.error ?? "Selection failed");
      if (!data.shot) {
        throw new Error("Selection succeeded but shot was not returned");
      }
      await Promise.resolve(onPlaceholderSelected(data.shot));
      applyBatchView(data, viewingBatchIdRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed");
    } finally {
      setSelectingId(null);
    }
  }

  async function dismissOptions() {
    if (!viewingBatchId) return;
    if (
      !confirm(
        "Remove this generation pack? Your current shot placeholder stays as-is."
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/placeholder-batch?batchId=${encodeURIComponent(viewingBatchId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to remove pack");
      }
      await loadBatch(activeBatchId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove pack"
      );
    }
  }

  async function dismissError() {
    setError(null);
    if (batch?.status === "failed" && viewingBatchId) {
      try {
        await fetch(
          `${apiBase}/placeholder-batch?batchId=${encodeURIComponent(viewingBatchId)}`,
          { method: "DELETE" }
        );
        await loadBatch(activeBatchId);
      } catch {
        /* keep visible batch if dismiss fails */
      }
    }
  }

  const activePack = useMemo(
    () => packs.find((pack) => pack.batch.id === activeBatchId) ?? null,
    [packs, activeBatchId]
  );
  const activeBatch = activePack?.batch ?? null;

  const descriptionEmpty = !placeholderDescription.trim();
  const isGenerating =
    submitting ||
    activeBatch?.status === "queued" ||
    activeBatch?.status === "running";
  const batchFailed = batch?.status === "failed";
  const canSelectFromPack =
    batch?.status === "awaiting_selection" || batch?.status === "archived";
  const awaitingSelection = canSelectFromPack;
  const canRegenerate =
    activeBatch?.status === "awaiting_selection" && !isGenerating;
  const generateLabel =
    canRegenerate && !isGenerating
      ? "Regenerate shot options"
      : batchFailed && viewingBatchId === activeBatchId
        ? "Try again"
        : "Generate shot image";
  const ready =
    !descriptionEmpty &&
    comfyuiOk === true &&
    stackReady &&
    !isGenerating;
  const readyHint = descriptionEmpty
    ? "Add a shot prompt, location, or character cast first."
    : isGenerating
      ? "Generation is in progress. Wait for it to finish or remove the current pack."
      : comfyuiOk === false
        ? "ComfyUI is not reachable. Check Settings or System Status."
        : !stackReady
          ? "Choose a valid image model in the stack below."
          : null;
  const displayError =
    error ??
    (batchFailed && viewingBatchId === activeBatchId
      ? formatShotBatchFailureMessage(batch, options)
      : null);
  const showOptions = packs.length > 0;

  useEffect(() => {
    setExpanded(!hasPlaceholder);
  }, [shotId, hasPlaceholder]);

  useEffect(() => {
    if (isGenerating || submitting) {
      setExpanded(true);
    }
  }, [isGenerating, submitting]);

  const toggleExpanded = useCallback(() => {
    setExpanded((open) => !open);
  }, []);

  return {
    apiBase,
    batch,
    options,
    packs,
    activeBatchId,
    viewingBatchId,
    selectPack,
    sampleCount,
    setSampleCount,
    promptPreview,
    negativePreview,
    previewLoading,
    previewError,
    stillNegativePrompt,
    onStillNegativePromptChange: onRenderOverridesChange
      ? handleStillNegativePromptChange
      : undefined,
    showPreview,
    togglePromptPreview,
    comfyuiOk,
    setComfyuiOk,
    stackReady,
    setStackReady,
    ipAdapterAvailable,
    setIpAdapterAvailable,
    selectingId,
    expanded,
    setExpanded,
    toggleExpanded,
    lightbox,
    setLightbox,
    descriptionEmpty,
    isGenerating,
    batchFailed,
    awaitingSelection,
    canSelectFromPack,
    generateLabel,
    ready,
    readyHint,
    displayError,
    showOptions,
    canRegenerate,
    handleGenerate,
    handleSelect,
    dismissError,
    dismissOptions,
  };
}

export type ShotPlaceholderBatchState = ReturnType<
  typeof useShotPlaceholderBatch
>;
