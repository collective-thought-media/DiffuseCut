import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { jsonError, handleApiError } from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import {
  resolveMediaPath,
  resolveProjectRoot,
} from "@/lib/paths/project-paths";
import { mimeFromExtension } from "@/lib/services/media-import";

type RouteParams = { params: Promise<{ path: string[] }> };

function streamToResponse(stream: fs.ReadStream): Response {
  const body = Readable.toWeb(stream) as ReadableStream;
  return new Response(body, {
    status: stream.destroyed ? 500 : 200,
  });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;

    if (!segments || segments.length < 2) {
      return jsonError("Invalid media path", 400);
    }

    const [projectId, ...rest] = segments;
    const relativePath = rest.join("/");

    if (!relativePath || relativePath.includes("..")) {
      return jsonError("Invalid media path", 400);
    }

    const db = getDb();
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) {
      return jsonError("Project not found", 404);
    }

    const projectRoot = resolveProjectRoot(project);
    let absolutePath: string;

    try {
      absolutePath = resolveMediaPath(projectRoot, relativePath);
    } catch {
      return jsonError("Path traversal denied", 403);
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return jsonError("File not found", 404);
    }

    const fileName = path.basename(absolutePath);
    const contentType = mimeFromExtension(fileName);
    const { size } = fs.statSync(absolutePath);
    const rangeHeader = req.headers.get("range");

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (!match) {
        return jsonError("Invalid range header", 416);
      }

      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start > end ||
        start >= size
      ) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }

      const safeEnd = Math.min(end, size - 1);
      const chunkSize = safeEnd - start + 1;
      const stream = fs.createReadStream(absolutePath, {
        start,
        end: safeEnd,
      });

      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${safeEnd}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-cache",
        },
      });
    }

    const stream = fs.createReadStream(absolutePath);
    const response = streamToResponse(stream);
    response.headers.set("Content-Type", contentType);
    response.headers.set("Content-Length", String(size));
    response.headers.set("Accept-Ranges", "bytes");
    response.headers.set("Cache-Control", "private, no-cache");
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
