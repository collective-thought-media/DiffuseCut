import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonOk, jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const job = db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.id, id))
      .get();

    if (!job) return jsonError("Export job not found", 404);

    let settings = {};
    try {
      settings = JSON.parse(job.settingsJson || "{}");
    } catch {
      settings = {};
    }

    return jsonOk({ job, settings });
  } catch (err) {
    return handleApiError(err);
  }
}
