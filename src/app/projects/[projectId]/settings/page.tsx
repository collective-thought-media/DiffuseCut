"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, WorkflowTemplate } from "@/lib/db/schema";
import type { RenderSettings } from "@/types";
import { Button, Card, Input, Label, Select, Textarea, Badge } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/PageLoadingSkeleton";
import { deleteProjectRequest } from "@/lib/api/delete-project";

type PageProps = { params: Promise<{ projectId: string }> };

interface StorageInfo {
  totalBytes?: number;
  rendersBytes?: number;
  orphanCount?: number;
  orphanBytes?: number;
  projectRoot?: string;
}

function formatStorageBytes(bytes: number | undefined): string {
  if (bytes == null || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ProjectSettingsPage({ params }: PageProps) {
  const { projectId } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [endpointsJson, setEndpointsJson] = useState("[]");
  const [defaultFps, setDefaultFps] = useState(24);
  const [characterSheetTemplateId, setCharacterSheetTemplateId] = useState("");
  const [sheetTemplates, setSheetTemplates] = useState<WorkflowTemplate[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, storageRes, templatesRes, renderSettingsRes] =
        await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/storage`).catch(() => null),
        fetch("/api/workflow-templates?purpose=character_sheet"),
        fetch(`/api/projects/${projectId}/render-settings`),
      ]);
      const projData = await projRes.json();
      if (!projRes.ok) throw new Error(projData.error ?? "Failed to load");
      setProject(projData.project);
      setDefaultFps(projData.project.defaultFps ?? 24);
      const eps = projData.project.comfyuiEndpointsJson;
      if (eps) {
        try {
          setEndpointsJson(JSON.stringify(JSON.parse(eps), null, 2));
        } catch {
          setEndpointsJson(eps);
        }
      } else {
        setEndpointsJson("[]");
      }
      if (templatesRes?.ok) {
        const templatesData = await templatesRes.json();
        setSheetTemplates(templatesData.templates ?? []);
      }
      if (renderSettingsRes?.ok) {
        const rsData = await renderSettingsRes.json();
        const rs = (rsData.renderSettings ?? {}) as RenderSettings;
        setCharacterSheetTemplateId(rs.characterSheetTemplateId ?? "");
      }
      if (storageRes?.ok) {
        const storageData = await storageRes.json();
        setStorage({
          totalBytes: storageData.totalBytes,
          projectRoot: storageData.projectRoot,
          rendersBytes: storageData.breakdown?.renders,
          orphanCount: storageData.orphanedRenders?.count,
          orphanBytes: storageData.orphanedRenders?.totalBytes,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      JSON.parse(endpointsJson);
      const renderSettingsRes = await fetch(
        `/api/projects/${projectId}/render-settings`
      );
      const existingRs = renderSettingsRes.ok
        ? ((await renderSettingsRes.json()).renderSettings as RenderSettings)
        : ({} as RenderSettings);

      const [projRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            defaultFps,
            comfyuiEndpointsJson: endpointsJson,
          }),
        }),
        fetch(`/api/projects/${projectId}/render-settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            renderSettings: {
              ...existingRs,
              characterSheetTemplateId: characterSheetTemplateId || undefined,
            },
          }),
        }),
      ]);
      const data = await projRes.json();
      if (!projRes.ok) throw new Error(data.error ?? "Save failed");
      setProject(data.project);
      setMessage("Project settings saved.");
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Endpoints must be valid JSON");
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePurgeRenders() {
    if (
      !confirm(
        "Delete orphaned render files not referenced by any shot? This cannot be undone."
      )
    ) {
      return;
    }
    setPurging(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/storage/purge-renders`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Purge failed");
      const freed = data.freedBytes ?? 0;
      setMessage(
        `Purged ${data.deletedFiles?.length ?? 0} files (${(freed / 1024 / 1024).toFixed(1)} MB freed).`
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purge failed");
    } finally {
      setPurging(false);
    }
  }

  async function handleDeleteProject(deleteMedia: boolean) {
    if (!project || deleteConfirm.trim() !== project.name) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await deleteProjectRequest(projectId, deleteMedia);
      if (!result.ok) throw new Error(result.error);

      if (!deleteMedia && result.data.keptMediaPath) {
        setMessage(
          `Project removed from DiffuseCut. Media kept at ${result.data.keptMediaPath}`
        );
        window.setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 3500);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="ui-fade-in mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Project Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-project overrides for {project?.name ?? "this project"}.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="fps">Default FPS</Label>
            <Input
              id="fps"
              type="number"
              min={1}
              max={120}
              value={defaultFps}
              onChange={(e) => setDefaultFps(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-endpoints">
              ComfyUI endpoints override (JSON array, empty = use app default)
            </Label>
            <Textarea
              id="project-endpoints"
              value={endpointsJson}
              onChange={(e) => setEndpointsJson(e.target.value)}
              className="min-h-[100px] font-mono text-xs"
              placeholder='["http://127.0.0.1:8188"]'
            />
            <p className="text-xs text-muted-foreground">
              Optional. Leave as [] to use app-wide ComfyUI endpoints from Settings.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-sheet-template">
              Character sheet workflow override (empty = use app default)
            </Label>
            <Select
              id="project-sheet-template"
              value={characterSheetTemplateId}
              onChange={(e) => setCharacterSheetTemplateId(e.target.value)}
            >
              <option value="">Use app default</option>
              {sheetTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          {message && <p className="text-sm text-emerald-400">{message}</p>}

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </form>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Storage</h2>
        {storage && (
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {storage.orphanCount != null && (
              <Badge variant="warning">
                {storage.orphanCount} orphaned renders
              </Badge>
            )}
            {storage.orphanBytes != null && (
              <Badge>
                {(storage.orphanBytes / 1024 / 1024).toFixed(1)} MB reclaimable
              </Badge>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Remove render files in the project folder that are no longer linked to
          any shot.
        </p>
        <Button
          variant="destructive"
          onClick={() => void handlePurgeRenders()}
          disabled={purging}
        >
          {purging ? "Purging…" : "Purge orphaned renders"}
        </Button>
      </Card>

      <Card className="space-y-4 border-red-900/40">
        <h2 className="font-medium text-red-300">Delete project</h2>
        <p className="text-sm text-muted-foreground">
          Remove this project from DiffuseCut. You can delete only the app record
          and keep files on disk, or remove everything including characters,
          locations, storyboard frames, renders, audio, and exports
          {storage?.totalBytes != null
            ? ` (${formatStorageBytes(storage.totalBytes)} on disk)`
            : ""}
          .
        </p>
        {storage?.projectRoot && (
          <p className="font-mono text-xs text-muted-foreground">
            {storage.projectRoot}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="delete-confirm">
            Type the project name to confirm:{" "}
            <span className="font-medium text-foreground">{project?.name}</span>
          </Label>
          <Input
            id="delete-confirm"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={project?.name ?? "Project name"}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={
              deleting ||
              !project ||
              deleteConfirm.trim() !== project.name
            }
            onClick={() => void handleDeleteProject(false)}
          >
            {deleting ? "Removing…" : "Remove from app, keep media"}
          </Button>
          <Button
            variant="destructive"
            disabled={
              deleting ||
              !project ||
              deleteConfirm.trim() !== project.name
            }
            onClick={() => void handleDeleteProject(true)}
          >
            {deleting ? "Deleting…" : "Delete project and media"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
