"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Sequence } from "@/lib/db/schema";

const storageKey = (projectId: string) =>
  `diffusecut-active-sequence-${projectId}`;

export function useActiveSequence(projectId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [sequencesLoading, setSequencesLoading] = useState(true);

  const querySequenceId = searchParams.get("sequence");

  const loadSequences = useCallback(async () => {
    setSequencesLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sequences`);
      const data = await res.json();
      if (res.ok) {
        setSequences(data.sequences ?? []);
      } else {
        setSequences([]);
      }
    } finally {
      setSequencesLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadSequences();
  }, [loadSequences]);

  const activeSequenceId = useMemo(() => {
    if (sequences.length === 0) return null;
    if (
      querySequenceId &&
      sequences.some((seq) => seq.id === querySequenceId)
    ) {
      return querySequenceId;
    }
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(storageKey(projectId));
      if (stored && sequences.some((seq) => seq.id === stored)) {
        return stored;
      }
    }
    return sequences[0]?.id ?? null;
  }, [querySequenceId, projectId, sequences]);

  const activeSequence =
    sequences.find((s) => s.id === activeSequenceId) ?? sequences[0] ?? null;

  useEffect(() => {
    if (!activeSequenceId || typeof window === "undefined") return;
    sessionStorage.setItem(storageKey(projectId), activeSequenceId);
  }, [activeSequenceId, projectId]);

  useEffect(() => {
    if (sequencesLoading || !activeSequenceId) return;
    if (querySequenceId === activeSequenceId) return;
    // Do not overwrite a valid in-flight ?sequence= while router.replace catches up.
    if (
      querySequenceId &&
      sequences.some((seq) => seq.id === querySequenceId)
    ) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("sequence", activeSequenceId);
    router.replace(`${pathname}?${params.toString()}`);
  }, [
    activeSequenceId,
    pathname,
    querySequenceId,
    router,
    searchParams,
    sequences,
    sequencesLoading,
  ]);

  const setActiveSequenceId = useCallback(
    (sequenceId: string) => {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(storageKey(projectId), sequenceId);
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("sequence", sequenceId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, projectId, router, searchParams]
  );

  return {
    sequences,
    sequencesLoading,
    activeSequenceId,
    activeSequence,
    setActiveSequenceId,
    reloadSequences: loadSequences,
  };
}
