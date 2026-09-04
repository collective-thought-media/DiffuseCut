"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DebouncedSaveContext = {
  isLatest: () => boolean;
};

export function useDebouncedSave<T>(
  saveFn: (value: T, ctx: DebouncedSaveContext) => Promise<void>,
  delayMs = 600
) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  const epochRef = useRef(0);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const flush = useCallback(async (value: T) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const epochAtStart = epochRef.current;
    const ctx: DebouncedSaveContext = {
      isLatest: () => epochAtStart === epochRef.current,
    };
    setSaving(true);
    setError(null);
    try {
      await saveFnRef.current(value, ctx);
      if (ctx.isLatest()) {
        setSaved(true);
      }
    } catch (err) {
      if (ctx.isLatest()) {
        setError(err instanceof Error ? err.message : "Save failed");
        setSaved(false);
      }
    } finally {
      if (ctx.isLatest()) {
        setSaving(false);
      }
    }
  }, []);

  const schedule = useCallback(
    (value: T) => {
      epochRef.current += 1;
      setSaved(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush(value);
      }, delayMs);
    },
    [delayMs, flush]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { schedule, flush, saving, saved, error };
}
