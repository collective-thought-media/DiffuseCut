import type { NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { createProject } from "@/lib/services/file-manager";
import { enrichProjectsWithPreviews } from "@/lib/project-preview";

interface CreateProjectBody {
  name: string;
  rootPath?: string | null;
}

export async function GET() {
  try {
    const db = getDb();
    const projects = db
      .select()
      .from(schema.projects)
      .orderBy(desc(schema.projects.updatedAt))
      .all();
    return jsonOk({ projects: enrichProjectsWithPreviews(projects) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson<CreateProjectBody>(req);
    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }

    const project = await createProject({
      name: body.name.trim(),
      rootPath: body.rootPath,
    });

    return jsonOk({ project }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
