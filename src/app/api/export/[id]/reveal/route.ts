import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { resolveProjectRoot } from "@/lib/paths/project-paths";

const execFileAsync = promisify(execFile);

/** Explorer args that open the parent folder and select this file. */
export function windowsRevealExplorerArgs(filePath: string): string[] {
  return [`/select,${filePath}`];
}

/**
 * Open Explorer on the file. Hide the cmd helper window only.
 * explorer.exe itself must stay visible, and it often exits 1 after success.
 */
function revealWindowsFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cmd.exe",
      ["/c", "start", "", "explorer.exe", ...windowsRevealExplorerArgs(filePath)],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    child.once("error", reject);
    child.unref();
    resolve();
  });
}

type RouteParams = { params: Promise<{ id: string }> };

interface RevealBody {
  action?: "reveal" | "open";
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await parseJson<RevealBody>(req).catch(() => ({} as RevealBody));
    const action = body.action === "open" ? "open" : "reveal";

    const db = getDb();
    const job = db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.id, id))
      .get();

    if (!job) return jsonError("Export job not found", 404);
    if (!job.outputPath) {
      return jsonError("Export file is not ready yet.", 400);
    }

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, job.projectId))
      .get();
    if (!project) return jsonError("Project not found", 404);

    const absolutePath = path.join(
      resolveProjectRoot(project),
      job.outputPath.replace(/\\/g, "/")
    );

    if (!fs.existsSync(absolutePath)) {
      return jsonError("Export file missing on disk.", 404);
    }

    if (process.platform === "win32") {
      if (action === "open") {
        await execFileAsync("cmd.exe", ["/c", "start", "", absolutePath], {
          windowsHide: true,
        });
      } else {
        await revealWindowsFile(absolutePath);
      }
    } else if (process.platform === "darwin") {
      if (action === "open") {
        await execFileAsync("open", [absolutePath]);
      } else {
        await execFileAsync("open", ["-R", absolutePath]);
      }
    } else {
      await execFileAsync("xdg-open", [
        action === "open" ? absolutePath : path.dirname(absolutePath),
      ]);
    }

    return jsonOk({ ok: true, path: absolutePath, action });
  } catch (err) {
    return handleApiError(err);
  }
}
