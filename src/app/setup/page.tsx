"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DependencyStatus } from "@/types";
import { DependencyChecklist } from "@/components/setup/DependencyChecklist";
import { Button, Card, Badge } from "@/components/ui/button";

export default function SetupPage() {
  const [deps, setDeps] = useState<DependencyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDeps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/dependencies");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load dependencies");
      setDeps(data.dependencies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeps();
  }, [loadDeps]);

  async function handleRecheck() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/system/dependencies/recheck", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Recheck failed");
      setDeps(data.dependencies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recheck failed");
    } finally {
      setChecking(false);
    }
  }

  const appReady = deps
    .filter((d) => d.requiredFor.includes("app"))
    .every((d) => d.status === "ok" || d.status === "warning");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System Status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live health check for DiffuseCut, ComfyUI, FFmpeg, and optional
          workflow stacks (SDXL sheets, IP-Adapter, LTX, MiniMax, ACE-Step).
          Re-check after you install models or change endpoints.
        </p>
      </div>

      <Card className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Core app</span>
          {loading ? (
            <Badge>Checking…</Badge>
          ) : appReady ? (
            <Badge variant="success">Ready</Badge>
          ) : (
            <Badge variant="warning">Needs attention</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRecheck()}
          disabled={checking || loading}
        >
          {checking ? "Re-checking…" : "Re-check"}
        </Button>
      </Card>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading checklist…</p>
      ) : (
        <DependencyChecklist deps={deps} />
      )}

      <div className="flex justify-end pt-2">
        <Link href="/">
          <Button disabled={!appReady && deps.length > 0}>
            Continue to projects
          </Button>
        </Link>
      </div>
    </div>
  );
}
