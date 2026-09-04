import type { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { validateBindings } from "@/lib/services/workflow-builder";
import { nanoid, nowMs } from "@/lib/utils";
import type { WorkflowBindings } from "@/types";

interface ImportTemplateBody {
  name: string;
  description?: string;
  workflowJson: string;
  bindingsJson?: string | WorkflowBindings;
  purpose?: "shot_video" | "character_sheet" | "location_sheet";
}

export async function GET(req: NextRequest) {
  try {
    const purpose = req.nextUrl.searchParams.get("purpose");
    const db = getDb();
    let templates = db
      .select()
      .from(schema.workflowTemplates)
      .orderBy(desc(schema.workflowTemplates.createdAt))
      .all();

    if (
      purpose === "shot_video" ||
      purpose === "character_sheet" ||
      purpose === "location_sheet"
    ) {
      templates = templates.filter((t) => t.purpose === purpose);
    }

    return jsonOk({ templates });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseJson<ImportTemplateBody>(req);
    if (!body.name?.trim()) return jsonError("name is required", 400);
    if (!body.workflowJson?.trim()) {
      return jsonError("workflowJson is required", 400);
    }

    JSON.parse(body.workflowJson);

    let bindingsJson = "{}";
    if (body.bindingsJson !== undefined) {
      if (typeof body.bindingsJson === "string") {
        JSON.parse(body.bindingsJson);
        bindingsJson = body.bindingsJson;
      } else {
        bindingsJson = JSON.stringify(body.bindingsJson);
      }
    }

    const bindings = JSON.parse(bindingsJson) as WorkflowBindings;
    validateBindings(body.workflowJson, bindings);

    const purpose = body.purpose ?? "shot_video";
    if (
      purpose !== "shot_video" &&
      purpose !== "character_sheet" &&
      purpose !== "location_sheet"
    ) {
      return jsonError("Invalid purpose", 400);
    }

    const id = nanoid();
    const ts = nowMs();
    const row = {
      id,
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      workflowJson: body.workflowJson,
      bindingsJson,
      purpose,
      isBuiltin: false,
      createdAt: ts,
    };

    const db = getDb();
    db.insert(schema.workflowTemplates).values(row).run();

    const template = db
      .select()
      .from(schema.workflowTemplates)
      .where(eq(schema.workflowTemplates.id, id))
      .get()!;

    return jsonOk({ template }, 201);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return jsonError("workflowJson or bindingsJson must be valid JSON", 400);
    }
    return handleApiError(err);
  }
}