import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { nowMs } from "@/lib/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const job = db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, id))
      .get();

    if (!job) return jsonError("Render job not found", 404);

    if (job.status === "completed" || job.status === "cancelled") {
      return jsonError(`Cannot cancel job with status: ${job.status}`, 400);
    }

    const ts = nowMs();
    db.update(schema.renderJobs)
      .set({
        status: "cancelled",
        statusMessage: "Cancelled",
        completedAt: ts,
        lastHeartbeatAt: ts,
      })
      .where(eq(schema.renderJobs.id, id))
      .run();

    if (job.status === "queued") {
      db.update(schema.shots)
        .set({
          renderStatus: "pending",
          renderJobId: null,
          updatedAt: ts,
        })
        .where(eq(schema.shots.id, job.shotId))
        .run();
    }

    const cancelled = db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, id))
      .get()!;

    return jsonOk({ job: cancelled });
  } catch (err) {
    return handleApiError(err);
  }
}
