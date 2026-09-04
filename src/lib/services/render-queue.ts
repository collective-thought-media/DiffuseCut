import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { RenderJob } from "@/lib/db/schema";
import {
  getDefaultComfyuiEndpoints,
  resolveComfyuiEndpoints,
} from "@/lib/services/settings";
import { listEndpoints } from "@/lib/services/comfyui-client";
import {
  formatMissingRenderSettingsMessage,
  validateRenderSettingsForTemplate,
} from "@/lib/services/render-settings-validation";
import { hydrateProjectRenderSettings } from "@/lib/services/render-settings-resolver";

export async function enqueueRenderJobs(
  projectId: string,
  shotIds: string[],
  templateId: string
): Promise<RenderJob[]> {
  if (shotIds.length === 0) return [];

  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const template = db
    .select()
    .from(schema.workflowTemplates)
    .where(eq(schema.workflowTemplates.id, templateId))
    .get();

  if (!template) {
    throw new Error(`Workflow template not found: ${templateId}`);
  }

  const { renderSettings } = await hydrateProjectRenderSettings(projectId, {
    template,
    persist: true,
    updateAppDefaults: true,
  });

  const settingsCheck = validateRenderSettingsForTemplate(
    template.bindingsJson,
    renderSettings
  );
  if (!settingsCheck.ok) {
    throw new Error(
      formatMissingRenderSettingsMessage(settingsCheck.missing)
    );
  }

  const appEndpoints = await getDefaultComfyuiEndpoints();
  const endpoints = resolveComfyuiEndpoints(
    project.comfyuiEndpointsJson,
    appEndpoints
  );
  const endpointUrl = await listEndpoints(endpoints);

  if (!endpointUrl) {
    throw new Error(
      "No reachable ComfyUI endpoint. Add your ComfyUI URL in Settings or project settings."
    );
  }

  const shots = db
    .select()
    .from(schema.shots)
    .where(inArray(schema.shots.id, shotIds))
    .all()
    .filter((shot) => shot.projectId === projectId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (shots.length === 0) {
    throw new Error("No matching shots found for project");
  }

  const activeJobs = db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.projectId, projectId))
    .all()
    .filter((job) => job.status === "queued" || job.status === "running");
  const busyShotIds = new Set(activeJobs.map((job) => job.shotId));

  const shotsToQueue = shots.filter((shot) => !busyShotIds.has(shot.id));
  if (shotsToQueue.length === 0) {
    throw new Error(
      "Selected shots are already queued or rendering. Wait for the active jobs to finish."
    );
  }

  const now = Date.now();
  const created: RenderJob[] = [];

  for (const [index, shot] of shotsToQueue.entries()) {
    const jobId = nanoid();
    const jobCreatedAt = now + index;
    const row = {
      id: jobId,
      projectId,
      shotId: shot.id,
      workflowTemplateId: templateId,
      comfyuiEndpointUrl: endpointUrl,
      comfyuiPromptId: null,
      frameCount: shot.durationFrames,
      status: "queued" as const,
      progress: 0,
      currentNodeId: null,
      currentNodeLabel: null,
      progressStep: null,
      progressMax: null,
      statusMessage: "Queued",
      lastHeartbeatAt: now,
      previewImagePath: null,
      errorMessage: null,
      outputPath: null,
      payloadJson: null,
      createdAt: jobCreatedAt,
      completedAt: null,
    };

    db.insert(schema.renderJobs).values(row).run();

    db.update(schema.shots)
      .set({
        renderStatus: "queued",
        renderJobId: jobId,
        updatedAt: now,
      })
      .where(eq(schema.shots.id, shot.id))
      .run();

    created.push(
      db
        .select()
        .from(schema.renderJobs)
        .where(eq(schema.renderJobs.id, jobId))
        .get()!
    );
  }

  return created;
}

export function getJobsForProject(projectId: string): RenderJob[] {
  const db = getDb();
  return db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.projectId, projectId))
    .all()
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getNextQueuedRenderJob(): RenderJob | null {
  const db = getDb();
  const queued = db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.status, "queued"))
    .all();

  if (queued.length === 0) return null;

  const shotIds = [...new Set(queued.map((job) => job.shotId))];
  const shots = db
    .select({
      id: schema.shots.id,
      sortOrder: schema.shots.sortOrder,
    })
    .from(schema.shots)
    .where(inArray(schema.shots.id, shotIds))
    .all();
  const shotOrder = new Map(shots.map((shot) => [shot.id, shot.sortOrder]));

  return queued.sort((a, b) => {
    const orderA = shotOrder.get(a.shotId) ?? Number.MAX_SAFE_INTEGER;
    const orderB = shotOrder.get(b.shotId) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.createdAt - b.createdAt;
  })[0];
}

export function getRunningRenderJobs(): RenderJob[] {
  const db = getDb();
  return db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.status, "running"))
    .all();
}
