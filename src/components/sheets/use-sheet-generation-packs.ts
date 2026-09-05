"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AssetGenerationBatch,
  AssetGenerationOption,
} from "@/lib/db/schema";
import type { AssetGenerationPack } from "@/lib/asset-generation-pack-types";

export function buildOptimisticQueuedOptions(
  sampleCount: number,
  existing: AssetGenerationOption[],
  batchId?: string | null
): AssetGenerationOption[] {
  const ts = Date.now();
  return Array.from({ length: sampleCount }, (_, index) => {
    const prior = existing[index];
    const base: AssetGenerationOption =
      prior ??
      ({
        id: `optimistic-${index}-${ts}`,
        batchId: batchId ?? "pending",
        variantIndex: index,
        seed: 0,
        status: "queued",
        comfyuiPromptId: null,
        outputPath: null,
        progress: 0,
        statusMessage: "Queued…",
        lastHeartbeatAt: null,
        selected: false,
        errorMessage: null,
        createdAt: ts,
        completedAt: null,
        pipelineStage: null,
        pipelineGroupId: null,
        dependsOnOptionId: null,
      } satisfies AssetGenerationOption);
    return {
      ...base,
      status: "queued",
      outputPath: null,
      progress: 0,
      errorMessage: null,
      statusMessage: "Queued…",
    };
  });
}

export type SheetGenerationBatchView = {
  batch?: AssetGenerationBatch | null;
  options?: AssetGenerationOption[];
  packs?: AssetGenerationPack[];
  activeBatchId?: string | null;
};

export function useSheetGenerationPacks(apiBase: string) {
  const [batch, setBatch] = useState<AssetGenerationBatch | null>(null);
  const [options, setOptions] = useState<AssetGenerationOption[]>([]);
  const [packs, setPacks] = useState<AssetGenerationPack[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [viewingBatchId, setViewingBatchId] = useState<string | null>(null);
  const viewingBatchIdRef = useRef<string | null>(null);

  const applyBatchView = useCallback(
    (view: SheetGenerationBatchView, preferBatchId?: string | null) => {
      let nextPacks = view.packs ?? [];
      if (nextPacks.length === 0 && view.batch) {
        nextPacks = [
          {
            batch: view.batch,
            options: view.options ?? [],
            packNumber: 1,
            isLatest: true,
          },
        ];
      }
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
      const url = batchId
        ? `${apiBase}/sheet-batch?batchId=${encodeURIComponent(batchId)}`
        : `${apiBase}/sheet-batch`;
      const res = await fetch(url);
      if (res.status === 404) {
        viewingBatchIdRef.current = null;
        setViewingBatchId(null);
        setBatch(null);
        setOptions([]);
        setPacks([]);
        setActiveBatchId(null);
        return null;
      }
      const data = (await res.json()) as SheetGenerationBatchView & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load batch");
      }
      applyBatchView(data, batchId);
      return data;
    },
    [apiBase, applyBatchView]
  );

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

  const handleStreamMessage = useCallback(
    (view: SheetGenerationBatchView, submitting: boolean) => {
      let nextPacks = view.packs ?? [];
      if (nextPacks.length === 0 && view.batch) {
        nextPacks = [
          {
            batch: view.batch,
            options: view.options ?? [],
            packNumber: 1,
            isLatest: true,
          },
        ];
      }
      setPacks(nextPacks);
      setActiveBatchId(view.activeBatchId ?? null);

      const activePack = view.activeBatchId
        ? nextPacks.find((pack) => pack.batch.id === view.activeBatchId)
        : null;
      const activeInFlight =
        activePack &&
        (activePack.batch.status === "queued" ||
          activePack.batch.status === "running");

      if (activeInFlight && activePack) {
        viewingBatchIdRef.current = activePack.batch.id;
        setViewingBatchId(activePack.batch.id);
        setBatch(activePack.batch);
        setOptions(activePack.options);
        return;
      }

      if (submitting) {
        return;
      }

      const viewId = viewingBatchIdRef.current;
      const viewedPack = viewId
        ? nextPacks.find((pack) => pack.batch.id === viewId)
        : null;

      if (viewedPack) {
        setBatch(viewedPack.batch);
        setOptions(viewedPack.options);
        return;
      }

      if (view.activeBatchId && activePack) {
        viewingBatchIdRef.current = activePack.batch.id;
        setViewingBatchId(activePack.batch.id);
        setBatch(activePack.batch);
        setOptions(activePack.options);
        return;
      }

      if (view.batch) {
        viewingBatchIdRef.current = view.batch.id;
        setViewingBatchId(view.batch.id);
        setBatch(view.batch);
        setOptions(view.options ?? []);
        return;
      }

      if (nextPacks.length === 0 && !view.activeBatchId) {
        viewingBatchIdRef.current = null;
        setViewingBatchId(null);
        setBatch(null);
        setOptions([]);
      }
    },
    []
  );

  const dismissPack = useCallback(async () => {
    if (!viewingBatchIdRef.current) return;
    const res = await fetch(
      `${apiBase}/sheet-batch?batchId=${encodeURIComponent(viewingBatchIdRef.current)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Failed to remove pack");
    }
    await loadBatch(activeBatchId);
  }, [apiBase, activeBatchId, loadBatch]);

  const clearPacks = useCallback(() => {
    viewingBatchIdRef.current = null;
    setViewingBatchId(null);
    setBatch(null);
    setOptions([]);
    setPacks([]);
    setActiveBatchId(null);
  }, []);

  return {
    batch,
    options,
    packs,
    activeBatchId,
    viewingBatchId,
    viewingBatchIdRef,
    setViewingBatchId,
    applyBatchView,
    loadBatch,
    selectPack,
    handleStreamMessage,
    dismissPack,
    clearPacks,
    setBatch,
    setOptions,
    setPacks,
    setActiveBatchId,
  };
}
