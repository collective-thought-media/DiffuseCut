import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  jsonOk,
  jsonError,
  handleApiError,
  parseJson,
} from "@/lib/api-helpers";
import { getDb, schema } from "@/lib/db";
import { validateBindings } from "@/lib/services/workflow-builder";
import type { WorkflowBindings } from "@/types";

interface PatchBindingsBody {
  bindingsJson?: string;
  bindings?: WorkflowBindings;
}

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const template = db
      .select()
      .from(schema.workflowTemplates)
      .where(eq(schema.workflowTemplates.id, id))
      .get();

    if (!template) return jsonError("Workflow template not found", 404);

    const body = await parseJson<PatchBindingsBody>(req);
    let bindingsJson: string;

    if (body.bindingsJson !== undefined) {
      JSON.parse(body.bindingsJson);
      bindingsJson = body.bindingsJson;
    } else if (body.bindings !== undefined) {
      bindingsJson = JSON.stringify(body.bindings);
    } else {
      return jsonError("bindings or bindingsJson is required", 400);
    }

    const bindings = JSON.parse(bindingsJson) as WorkflowBindings;
    validateBindings(template.workflowJson, bindings);

    db.update(schema.workflowTemplates)
      .set({ bindingsJson })
      .where(eq(schema.workflowTemplates.id, id))
      .run();

    const updated = db
      .select()
      .from(schema.workflowTemplates)
      .where(eq(schema.workflowTemplates.id, id))
      .get()!;

    return jsonOk({ template: updated });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return jsonError("bindingsJson must be valid JSON", 400);
    }
    return handleApiError(err);
  }
}
