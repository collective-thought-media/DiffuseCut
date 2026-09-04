"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import type { RenderJob, Shot, WorkflowTemplate } from "@/lib/db/schema";
import {
  BUILTIN_LTX_I2V_TEMPLATE_ID,
  BUILTIN_MINIMAX_I2V_TEMPLATE_ID,
  resolveTemplateVideoEngine,
} from "@/lib/db/builtin-template-ids";
import {
  formatMissingRenderSettingsMessage,
  getMissingRenderSettingsForBindings,
} from "@/lib/services/render-settings-validation";
import { deriveShotRenderDisplay, shotHasActiveRenderJob } from "@/lib/render-shot-display";
import type { RenderSettings, WorkflowBindings } from "@/types";
import { RenderJobCenter, pickDefaultShotId } from "@/components/render/RenderJobCenter";
import { QueuePanel } from "@/components/render/QueuePanel";
import { RenderSettingsPanel } from "@/components/render/RenderSettingsPanel";
import { TemplateBindingWizard } from "@/components/render/TemplateBindingWizard";
import { WorkflowTemplateImport } from "@/components/render/WorkflowTemplateImport";
import { Button, Card, Select } from "@/components/ui/button";
import Link from "next/link";
import type { DependencyStatus } from "@/types";

type PageProps = { params: Promise<{ projectId: string }> };

const BUILTIN_VIDEO_TEMPLATE_ORDER = [
  BUILTIN_LTX_I2V_TEMPLATE_ID,
  BUILTIN_MINIMAX_I2V_TEMPLATE_ID,
] as const;

function sortShotVideoTemplates(templates: WorkflowTemplate[]): WorkflowTemplate[] {
  return [...templates].sort((a, b) => {
    const ai = BUILTIN_VIDEO_TEMPLATE_ORDER.indexOf(
      a.id as (typeof BUILTIN_VIDEO_TEMPLATE_ORDER)[number]
    );
    const bi = BUILTIN_VIDEO_TEMPLATE_ORDER.indexOf(
      b.id as (typeof BUILTIN_VIDEO_TEMPLATE_ORDER)[number]
    );
    const aRank = ai === -1 ? 99 : ai;
    const bRank = bi === -1 ? 99 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });
}

function resolvePreferredVideoTemplateId(
  templates: WorkflowTemplate[],
  savedTemplateId?: string
): string {
  if (
    savedTemplateId &&
    templates.some((template) => template.id === savedTemplateId)
  ) {
    return savedTemplateId;
  }

  return (
    templates.find((template) => template.id === BUILTIN_LTX_I2V_TEMPLATE_ID)?.id ??
    templates.find((template) => template.id === BUILTIN_MINIMAX_I2V_TEMPLATE_ID)
      ?.id ??
    templates[0]?.id ??
    ""
  );
}

export default function RenderPage({ params }: PageProps) {
  const { projectId } = use(params);
  const [shots, setShots] = useState<Shot[]>([]);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [renderSettings, setRenderSettings] = useState<RenderSettings>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [selectedPreviewShotId, setSelectedPreviewShotId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comfyDependency, setComfyDependency] = useState<DependencyStatus | null>(
    null
  );
  const settingsHydratedRef = useRef(false);
  const templateHydratedRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [shotsRes, jobsRes, templatesRes, depsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/shots`),
        fetch(`/api/render-jobs?projectId=${projectId}`),
        fetch("/api/workflow-templates?purpose=shot_video"),
        fetch("/api/system/dependencies"),
      ]);
      const shotsData = await shotsRes.json();
      const jobsData = await jobsRes.json();
      const templatesData = await templatesRes.json();
      if (shotsRes.ok) {
        const loadedShots = shotsData.shots ?? [];
        setShots(loadedShots);
        if (jobsRes.ok) {
          const loadedJobs = jobsData.jobs ?? [];
          setJobs(loadedJobs);
          setSelectedPreviewShotId((prev) => {
            if (prev && loadedShots.some((shot: Shot) => shot.id === prev)) {
              return prev;
            }
            const displays = loadedShots.map((shot: Shot) =>
              deriveShotRenderDisplay(shot, loadedJobs)
            );
            return pickDefaultShotId(displays, loadedShots);
          });
        }
      } else if (jobsRes.ok) {
        setJobs(jobsData.jobs ?? []);
      }

      let preferredTemplateId = "";
      let loadedTemplates: WorkflowTemplate[] = [];
      if (templatesRes.ok) {
        loadedTemplates = sortShotVideoTemplates(templatesData.templates ?? []);
        setTemplates(loadedTemplates);
      }

      const settingsPeekRes = await fetch(
        `/api/projects/${projectId}/render-settings`
      );
      let savedTemplateId: string | undefined;
      if (settingsPeekRes.ok) {
        const peekData = await settingsPeekRes.json();
        savedTemplateId = peekData.renderSettings?.workflowTemplateId as
          | string
          | undefined;
      }

      preferredTemplateId = resolvePreferredVideoTemplateId(
        loadedTemplates,
        savedTemplateId
      );
      if (preferredTemplateId) {
        setSelectedTemplateId(preferredTemplateId);
      }

      const settingsRes = await fetch(
        `/api/projects/${projectId}/render-settings?hydrate=1${
          preferredTemplateId
            ? `&templateId=${encodeURIComponent(preferredTemplateId)}`
            : ""
        }`
      );
      if (settingsRes.ok && settingsRes.status !== 404) {
        const settingsData = await settingsRes.json();
        if (settingsData.renderSettings) {
          setRenderSettings(settingsData.renderSettings);
        }
      }

      templateHydratedRef.current = preferredTemplateId || null;

      if (depsRes.ok) {
        const depsData = await depsRes.json();
        const comfy = (depsData.dependencies as DependencyStatus[] | undefined)?.find(
          (dep) => dep.id === "comfyui"
        );
        setComfyDependency(comfy ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#image-generation") return;
    const target = document.getElementById("image-generation");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading]);

  useEffect(() => {
    if (loading || !selectedTemplateId) return;
    if (templateHydratedRef.current === selectedTemplateId) return;
    templateHydratedRef.current = selectedTemplateId;

    void (async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/render-settings?hydrate=1&templateId=${encodeURIComponent(selectedTemplateId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.renderSettings) {
          setRenderSettings(data.renderSettings);
        }
      } catch {
        /* keep current settings */
      }
    })();
  }, [projectId, selectedTemplateId, loading]);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(
        `/api/render-jobs/stream?projectId=${projectId}`
      );

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            jobs?: RenderJob[];
            shots?: Shot[];
          };
          if (data.jobs) setJobs(data.jobs);
          if (data.shots) setShots(data.shots);
        } catch {
          /* ignore malformed events */
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
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
  }, [projectId]);

  async function handleQueue() {
    if (selectedShotIds.length === 0) return;
    if (!selectedTemplateId) {
      setError(
        "Import a shot video workflow template before queueing. Character and location templates cannot render shots."
      );
      return;
    }

    const selectedShots = shots.filter((shot) =>
      selectedShotIds.includes(shot.id)
    );
    const missingPrompt = selectedShots.filter((shot) => !shot.prompt.trim());
    if (missingPrompt.length > 0) {
      setError(
        `These shots have no storyboard prompt (motion/description will be empty): ${missingPrompt.map((s) => s.title || "Untitled").join(", ")}.`
      );
      return;
    }

    if (selectedTemplate) {
      let bindings: WorkflowBindings = {};
      try {
        bindings = JSON.parse(
          selectedTemplate.bindingsJson || "{}"
        ) as WorkflowBindings;
      } catch {
        bindings = {};
      }
      const missing = getMissingRenderSettingsForBindings(
        bindings,
        renderSettings
      );
      if (missing.length > 0) {
        setError(formatMissingRenderSettingsMessage(missing));
        return;
      }
    }
    if (comfyDependency && comfyDependency.status !== "ok") {
      setError(
        "ComfyUI is not reachable. Set your ComfyUI URL in Settings or project settings, then recheck dependencies."
      );
      return;
    }
    setQueueing(true);
    setError(null);
    try {
      const res = await fetch("/api/render-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          shotIds: selectedShotIds,
          workflowTemplateId: selectedTemplateId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Queue failed");
      setSelectedShotIds([]);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue failed");
    } finally {
      setQueueing(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!settingsHydratedRef.current) {
      settingsHydratedRef.current = true;
      return;
    }
    const timeout = setTimeout(() => {
      void fetch(`/api/projects/${projectId}/render-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renderSettings }),
      });
    }, 600);
    return () => clearTimeout(timeout);
  }, [projectId, renderSettings, loading]);

  async function handleSaveBindings(bindings: WorkflowBindings) {
    if (!selectedTemplateId) return;
    const res = await fetch(
      `/api/workflow-templates/${selectedTemplateId}/bindings`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bindings }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Save bindings failed");
    await loadData();
  }

  async function handleCancelJob(jobId: string) {
    await fetch(`/api/render-jobs/${jobId}`, { method: "DELETE" });
    await loadData();
  }

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? null;
  const isVideoTemplate = selectedTemplate?.purpose === "shot_video";
  const videoEngine = selectedTemplateId
    ? resolveTemplateVideoEngine(selectedTemplateId)
    : "generic";

  let missingRenderSettings: string[] = [];
  if (selectedTemplate) {
    try {
      const bindings = JSON.parse(
        selectedTemplate.bindingsJson || "{}"
      ) as WorkflowBindings;
      missingRenderSettings = getMissingRenderSettingsForBindings(
        bindings,
        renderSettings
      );
    } catch {
      missingRenderSettings = [];
    }
  }

  const shotTitleMap = Object.fromEntries(
    shots.map((s) => [s.id, s.title || "Untitled"])
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading render page…</p>;
  }

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold">Render</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Queue shots on the left, tune models on the right, watch progress in
          the center.
        </p>
      </div>

      {(error ||
        (comfyDependency && comfyDependency.status !== "ok") ||
        missingRenderSettings.length > 0) && (
        <div className="shrink-0 space-y-2">
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          {comfyDependency && comfyDependency.status !== "ok" && (
            <Card className="border-amber-500/40 bg-amber-950/20 p-3 text-sm text-amber-200">
              <p>{comfyDependency.message}</p>
              <p className="mt-1 text-xs text-amber-200/80">
                {comfyDependency.installHint}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href="/settings">
                  <Button size="sm" variant="outline">
                    App settings
                  </Button>
                </Link>
                <Link href={`/projects/${projectId}/settings`}>
                  <Button size="sm" variant="outline">
                    Project ComfyUI override
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {missingRenderSettings.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-950/20 p-3 text-sm text-amber-200">
              {formatMissingRenderSettingsMessage(missingRenderSettings)}
            </Card>
          )}
        </div>
      )}

      <div className="grid flex-1 grid-rows-1 items-start gap-4 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(240px,320px)] lg:max-h-[calc(100vh-11rem)]">
        <aside className="order-2 flex min-h-0 flex-col gap-4 self-stretch lg:order-1 lg:max-h-[calc(100vh-11rem)]">
          <Card className="mb-0 shrink-0 space-y-4 p-4">
            <h3 className="text-sm font-medium">Workflow template</h3>
            {templates.length === 0 ? (
              <p className="text-xs text-amber-400">
                No shot video templates yet. Import one below to enable the
                render queue.
              </p>
            ) : (
              <>
                <Select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="text-xs"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                {selectedTemplateId === BUILTIN_LTX_I2V_TEMPLATE_ID && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Local LTX 2.3 I2V. Models and resolution auto-fill from your
                    ComfyUI install and last render setup.
                  </p>
                )}
                {selectedTemplateId === BUILTIN_MINIMAX_I2V_TEMPLATE_ID && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Local MiniMax H3 I2V with native audio (ComfyUI 0.30+). Models
                    auto-detect from your diffusion_models, vae, and text_encoders
                    folders.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWizardOpen(true)}
                  disabled={!selectedTemplate}
                >
                  Edit bindings
                </Button>
              </>
            )}
          </Card>

          <QueuePanel
            shots={shots}
            jobs={jobs}
            selectedShotIds={selectedShotIds}
            selectedPreviewShotId={selectedPreviewShotId}
            onSelectPreviewShot={setSelectedPreviewShotId}
            onToggleShot={(id) =>
              setSelectedShotIds((prev) =>
                prev.includes(id)
                  ? prev.filter((x) => x !== id)
                  : [...prev, id]
              )
            }
            onSelectAll={() =>
              setSelectedShotIds(
                shots
                  .filter((s) => !shotHasActiveRenderJob(s.id, jobs))
                  .map((s) => s.id)
              )
            }
            onClearSelection={() => setSelectedShotIds([])}
            onQueue={() => void handleQueue()}
            queueing={queueing}
            templateSelected={Boolean(selectedTemplateId)}
            settingsReady={missingRenderSettings.length === 0}
            comfyReady={!comfyDependency || comfyDependency.status === "ok"}
            fillHeight
          />

          {templates.length === 0 && (
            <WorkflowTemplateImport
              purpose="shot_video"
              defaultName="Shot video render"
              onImported={(template) => {
                setTemplates((prev) => [template, ...prev]);
                setSelectedTemplateId(template.id);
                setError(null);
              }}
            />
          )}
        </aside>

        <section className="order-1 flex min-h-0 min-w-0 flex-col self-stretch lg:order-2 lg:max-h-[calc(100vh-11rem)]">
          <RenderJobCenter
            projectId={projectId}
            jobs={jobs}
            shots={shots}
            shotTitleMap={shotTitleMap}
            selectedShotId={selectedPreviewShotId}
            onSelectShot={setSelectedPreviewShotId}
            onCancel={(id) => void handleCancelJob(id)}
          />
        </section>

        <aside className="order-3 flex flex-col lg:order-3">
          <RenderSettingsPanel
            settings={renderSettings}
            onChange={setRenderSettings}
            showVideoSettings={isVideoTemplate}
            videoEngine={videoEngine}
            variant="sidebar"
          />
        </aside>
      </div>

      <TemplateBindingWizard
        template={selectedTemplate}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSave={handleSaveBindings}
      />
    </div>
  );
}
