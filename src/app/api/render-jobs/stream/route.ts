import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { jsonError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { getJobsForProject } from "@/lib/services/render-queue";

const POLL_INTERVAL_MS = 1000;

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return jsonError("projectId is required", 400);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = () => {
        if (closed) return;
        const jobs = getJobsForProject(projectId);
        const db = getDb();
        const shots = db
          .select()
          .from(schema.shots)
          .where(eq(schema.shots.projectId, projectId))
          .all()
          .sort((a, b) => a.sortOrder - b.sortOrder);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ jobs, shots })}\n\n`)
        );
      };

      send();
      const interval = setInterval(send, POLL_INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
