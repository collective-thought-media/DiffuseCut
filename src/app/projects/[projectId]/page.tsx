"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/db/schema";
import {
  useDebouncedSave,
  type DebouncedSaveContext,
} from "@/lib/hooks/useDebouncedSave";
import { useSyncedEditableFields } from "@/lib/hooks/useSyncedEditableFields";
import { Card, Label, Textarea, Badge } from "@/components/ui/button";
import { ProjectStepNav } from "@/components/project/ProjectStepNav";
import { VisualStylePanel } from "@/components/project/VisualStylePanel";
import { ReferenceAspectRatioPanel } from "@/components/project/ReferenceAspectRatioPanel";
import { PageLoadingSkeleton } from "@/components/ui/PageLoadingSkeleton";

type PageProps = { params: Promise<{ projectId: string }> };

export default function ProjectDashboardPage({ params }: PageProps) {
  const { projectId } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fieldSource = useMemo(
    () => ({
      logline: project?.logline ?? "",
      plot: project?.plot ?? "",
    }),
    [project?.id, project?.logline, project?.plot]
  );
  const { fields, bind } = useSyncedEditableFields(fieldSource, projectId);

  const saveFields = useCallback(
    async (
      nextFields: { logline: string; plot: string },
      ctx: DebouncedSaveContext
    ) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextFields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (!ctx.isLatest()) return;
      setProject(data.project);
    },
    [projectId]
  );

  const { schedule, saving, saved, error: saveError } = useDebouncedSave(saveFields);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load project");
        setProject(data.project);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [projectId]);

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  if (error || !project) {
    return (
      <p className="text-sm text-red-400" role="alert">
        {error ?? "Project not found"}
      </p>
    );
  }

  return (
    <div className="ui-fade-in space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Logline and plot autosave as you type.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{project.defaultFps} fps</Badge>
          {saving ? (
            <Badge variant="warning">Saving…</Badge>
          ) : saved ? (
            <Badge variant="success">Saved</Badge>
          ) : (
            <Badge>Unsaved</Badge>
          )}
        </div>
      </div>

      {(saveError || error) && (
        <p className="text-sm text-red-400" role="alert">
          {saveError ?? error}
        </p>
      )}

      <Card>
        <h2 className="entity-card-header">Story</h2>
        <div className="space-y-1.5">
          <Label htmlFor="logline">Logline</Label>
          <Textarea
            id="logline"
            {...bind("logline", (next) => schedule(next))}
            placeholder="One-sentence hook for your film..."
            className="min-h-[80px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plot">Plot</Label>
          <Textarea
            id="plot"
            {...bind("plot", (next) => schedule(next))}
            placeholder="Full story outline..."
            className="min-h-[200px]"
          />
        </div>
      </Card>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card className="mb-0">
          <VisualStylePanel
            projectId={projectId}
            initialStyleJson={project.visualStyleJson}
          />
        </Card>
        <Card className="mb-0">
          <ReferenceAspectRatioPanel projectId={projectId} />
        </Card>
      </div>

      <ProjectStepNav projectId={projectId} currentSegment="" />
    </div>
  );
}
