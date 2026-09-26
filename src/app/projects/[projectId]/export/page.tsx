"use client";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import type { ExportJob, Shot } from "@/lib/db/schema";
import { ExportEncoderPanel } from "@/components/export/ExportEncoderPanel";
import { SequenceSwitcher } from "@/components/project/SequenceSwitcher";
import { useActiveSequence } from "@/lib/hooks/useActiveSequence";
import { withSequenceId } from "@/lib/sequence-api-url";

type PageProps = { params: Promise<{ projectId: string }> };

function ExportPageContent({ projectId }: { projectId: string }) {
  const {
    sequences,
    activeSequenceId,
    sequencesLoading,
    setActiveSequenceId,
    reloadSequences,
  } = useActiveSequence(projectId);
  const [shots, setShots] = useState<Shot[]>([]);
  const [fps, setFps] = useState(24);
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const renderedCount = shots.filter((s) => Boolean(s.videoPath)).length;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, shotsRes, exportsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(withSequenceId(`/api/projects/${projectId}/shots`, activeSequenceId)),
        fetch(`/api/projects/${projectId}/export`),
      ]);
      const projData = await projRes.json();
      const shotsData = await shotsRes.json();
      const exportsData = await exportsRes.json();

      if (!projRes.ok) throw new Error(projData.error);
      if (!shotsRes.ok) throw new Error(shotsData.error);

      setFps(projData.project.defaultFps ?? 24);
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
  }, [projectId, activeSequenceId]);

  useEffect(() => {
    if (sequencesLoading) return;
    if (!activeSequenceId) {
      setLoading(false);
      setError("No sequence found for this project.");
      return;
    }
    void loadAll();
  }, [loadAll, activeSequenceId, sequencesLoading]);

  if (loading || sequencesLoading) {
    return <p className="text-sm text-muted-foreground">Loading export page…</p>;
  }

  return (
    <div className="space-y-8">
      <SequenceSwitcher
        projectId={projectId}
        sequences={sequences}
        activeSequenceId={activeSequenceId}
        onSelect={setActiveSequenceId}
        onChanged={() => void reloadSequences()}
      />

      <div>
        <h1 className="text-2xl font-semibold">Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Encode the active sequence from the{" "}
          <Link
            href={`/projects/${projectId}/finishing`}
            className="text-primary hover:underline"
          >
            Edit
          </Link>{" "}
          desk (timeline or storyboard order).
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
          export can include the full sequence.
        </p>
      ) : null}

      <ExportEncoderPanel
        projectId={projectId}
        sequenceId={activeSequenceId}
        fps={fps}
        renderedCount={renderedCount}
        shotCount={shots.length}
        initialJob={activeJob}
      />
    </div>
  );
}

export default function ExportPage({ params }: PageProps) {
  const { projectId } = use(params);
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading export…</p>}>
      <ExportPageContent projectId={projectId} />
    </Suspense>
  );
}
