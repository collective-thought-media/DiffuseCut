"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { ExportJob, Shot } from "@/lib/db/schema";
import { ExportEncoderPanel } from "@/components/export/ExportEncoderPanel";

type PageProps = { params: Promise<{ projectId: string }> };

export default function ExportPage({ params }: PageProps) {
  const { projectId } = use(params);
  const [shots, setShots] = useState<Shot[]>([]);
  const [fps, setFps] = useState(24);
  const [configuredSize, setConfiguredSize] = useState<{
    width: number | null;
    height: number | null;
  }>({ width: null, height: null });
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const renderedCount = shots.filter((s) => Boolean(s.videoPath)).length;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, shotsRes, exportsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/shots`),
        fetch(`/api/projects/${projectId}/export`),
      ]);
      const projData = await projRes.json();
      const shotsData = await shotsRes.json();
      const exportsData = await exportsRes.json();

      if (!projRes.ok) throw new Error(projData.error);
      if (!shotsRes.ok) throw new Error(shotsData.error);

      setFps(projData.project.defaultFps ?? 24);
      try {
        const renderSettings = JSON.parse(
          projData.project.renderSettingsJson || "{}"
        ) as { videoWidth?: number; videoHeight?: number };
        setConfiguredSize({
          width: renderSettings.videoWidth ?? null,
          height: renderSettings.videoHeight ?? null,
        });
      } catch {
        setConfiguredSize({ width: null, height: null });
      }
      setShots(shotsData.shots ?? []);

      const jobs = (exportsData.jobs ?? []) as ExportJob[];
      const running =
        jobs.find((job) => job.status === "running" || job.status === "queued") ??
        jobs.find((job) => job.status === "completed") ??
        null;
      setActiveJob(running);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading export page…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Encode the final video with trim and audio from{" "}
          <Link
            href={`/projects/${projectId}/finishing`}
            className="text-primary hover:underline"
          >
            Finishing
          </Link>
          .
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {renderedCount < shots.length ? (
        <p className="text-sm text-amber-400">
          {shots.length - renderedCount} shot
          {shots.length - renderedCount === 1 ? "" : "s"} still need renders before
          export can include the full film.
        </p>
      ) : null}

      <ExportEncoderPanel
        projectId={projectId}
        fps={fps}
        renderedCount={renderedCount}
        shotCount={shots.length}
        initialJob={activeJob}
        configuredWidth={configuredSize.width}
        configuredHeight={configuredSize.height}
      />
    </div>
  );
}
