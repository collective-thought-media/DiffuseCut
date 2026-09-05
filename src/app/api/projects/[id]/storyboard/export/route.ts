import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { jsonError, handleApiError } from "@/lib/api-helpers";
import { collectStoryboardPacket } from "@/lib/services/storyboard-packet";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const shotId = req.nextUrl.searchParams.get("shotId");
    const packet = collectStoryboardPacket(projectId, shotId);

    const zip = new JSZip();
    for (const entry of packet.entries) {
      zip.file(entry.path, entry.data);
    }
    const body = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });

    return new NextResponse(Buffer.from(body), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${packet.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Project not found") {
      return jsonError(err.message, 404);
    }
    if (err instanceof Error && err.message === "Shot not found") {
      return jsonError(err.message, 404);
    }
    return handleApiError(err);
  }
}
