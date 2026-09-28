import fs from "fs";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { RenderJob, Shot } from "@/lib/db/schema";
import { videoEngineLabelForTemplate } from "@/lib/db/builtin-template-ids";
import { resolveProjectRoot, resolveMediaPath } from "@/lib/paths/project-paths";
import { nowMs } from "@/lib/utils";

export type ShotVideoOption = RenderJob & {
  templateName: string;
  engineLabel: string;
  selected: boolean;
};

export { videoEngineLabelForTemplate };

export function listCompletedRenderJobsForShot(
  projectId: string,
  shotId: string
): ShotVideoOption[] {
  const db = getDb();
  const shot = db
    .select()
    .from(schema.shots)
    .where(
      and(eq(schema.shots.id, shotId), eq(schema.shots.projectId, projectId))
    )
    .get();
  if (!shot) {
    throw new Error("Shot not found");
  }

  const jobs = db
    .select()
    .from(schema.renderJobs)
    .where(
      and(
        eq(schema.renderJobs.shotId, shotId),
        eq(schema.renderJobs.projectId, projectId),
        eq(schema.renderJobs.status, "completed")
      )
    )
    .orderBy(desc(schema.renderJobs.createdAt))
    .all()
    .filter((job) => Boolean(job.outputPath));

  const templateIds = [...new Set(jobs.map((job) => job.workflowTemplateId))];
  const templates =
    templateIds.length === 0
      ? []
      : db.select().from(schema.workflowTemplates).all();
  const nameById = new Map(templates.map((t) => [t.id, t.name]));

  return jobs.map((job) => ({
    ...job,
    templateName:
      nameById.get(job.workflowTemplateId) ?? job.workflowTemplateId,
    engineLabel: videoEngineLabelForTemplate(job.workflowTemplateId),
    selected:
      Boolean(shot.videoPath) &&
      Boolean(job.outputPath) &&
      shot.videoPath === job.outputPath,
  }));
}

/**
 * Point finishing/export at a prior completed render without deleting others.
 * Same role as selecting a still from a generation pack.
 */
export function selectShotVideoFromJob(
  projectId: string,
  shotId: string,
  jobId: string
): { shot: Shot; options: ShotVideoOption[] } {
  const db = getDb();
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) {
    throw new Error("Project not found");
  }

  const shot = db
    .select()
    .from(schema.shots)
    .where(
      and(eq(schema.shots.id, shotId), eq(schema.shots.projectId, projectId))
    )
    .get();
  if (!shot) {
    throw new Error("Shot not found");
  }

  const job = db
    .select()
    .from(schema.renderJobs)
    .where(
      and(
        eq(schema.renderJobs.id, jobId),
        eq(schema.renderJobs.shotId, shotId),
        eq(schema.renderJobs.projectId, projectId)
      )
    )
    .get();
  if (!job) {
    throw new Error("Render job not found for this shot");
  }
  if (job.status !== "completed" || !job.outputPath) {
    throw new Error("Only completed renders with output can be selected");
  }

  const projectRoot = resolveProjectRoot(project);
  const abs = resolveMediaPath(projectRoot, job.outputPath);
  if (!fs.existsSync(abs)) {
    throw new Error(
      "That render file is missing on disk. Pick another generation."
    );
  }

  const ts = nowMs();
  db.update(schema.shots)
    .set({
      videoPath: job.outputPath,
      renderStatus: "done",
      renderJobId: job.id,
      updatedAt: ts,
    })
    .where(eq(schema.shots.id, shotId))
    .run();

  const updated = db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotId))
    .get()!;

  return {
    shot: updated,
    options: listCompletedRenderJobsForShot(projectId, shotId),
  };
}
