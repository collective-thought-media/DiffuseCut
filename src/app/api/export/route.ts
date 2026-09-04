import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { assertDependency } from "@/lib/services/dependency-checker";
import type { ExportSettings } from "@/lib/services/ffmpeg-export";
import { nanoid, nowMs } from "@/lib/utils";

interface CreateExportBody {
  projectId: string;
  settings?: ExportSettings;
}

export async function POST(req: NextRequest) {
  try {
    await assertDependency("ffmpeg");

    const body = await parseJson<CreateExportBody>(req);
    if (!body.projectId) return jsonError("projectId is required", 400);

    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, body.projectId))
      .get();

    if (!project) return jsonError("Project not found", 404);

    const id = nanoid();
    const ts = nowMs();
    const settingsJson = JSON.stringify(body.settings ?? {});

    const row = {
      id,
      projectId: body.projectId,
      status: "queued" as const,
      outputPath: null,
      settingsJson,
      errorMessage: null,
      progress: 0,
      createdAt: ts,
      completedAt: null,
    };

    db.insert(schema.exportJobs).values(row).run();

    const job = db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.id, id))
      .get()!;

    return jsonOk({ job, jobId: id }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
