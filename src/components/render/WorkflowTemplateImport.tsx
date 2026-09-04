"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui/button";
import type { WorkflowTemplate } from "@/lib/db/schema";

interface WorkflowTemplateImportProps {
  purpose?: "shot_video" | "character_sheet" | "location_sheet";
  defaultName?: string;
  onImported: (template: WorkflowTemplate) => void;
}

export function WorkflowTemplateImport({
  purpose = "shot_video",
  defaultName = "",
  onImported,
}: WorkflowTemplateImportProps) {
  const [name, setName] = useState(defaultName);
  const [importPurpose, setImportPurpose] = useState(purpose);
  const [workflowJson, setWorkflowJson] = useState("");
  const [bindingsJson, setBindingsJson] = useState("{}");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          purpose: importPurpose,
          workflowJson,
          bindingsJson,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      onImported(data.template as WorkflowTemplate);
      setWorkflowJson("");
      setBindingsJson("{}");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="space-y-4 border-amber-500/30 bg-amber-500/5">
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div>
          <h3 className="font-medium">Import shot video workflow</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            DiffuseCut needs a ComfyUI API-format workflow for rendering clips.
            Export one from ComfyUI (Save API format), paste it here, and map
            bindings for prompt, frame count, reference image, checkpoint, and
            output nodes.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="render-import-name">Name</Label>
          <Input
            id="render-import-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My img2vid workflow"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="render-import-purpose">Purpose</Label>
          <Select
            id="render-import-purpose"
            value={importPurpose}
            onChange={(e) =>
              setImportPurpose(
                e.target.value as
                  | "shot_video"
                  | "character_sheet"
                  | "location_sheet"
              )
            }
          >
            <option value="shot_video">Shot video (render)</option>
            <option value="character_sheet">Character sheet</option>
            <option value="location_sheet">Location sheet</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="render-import-workflow">Workflow JSON</Label>
          <Textarea
            id="render-import-workflow"
            value={workflowJson}
            onChange={(e) => setWorkflowJson(e.target.value)}
            className="min-h-[120px] font-mono text-xs"
            placeholder='Paste ComfyUI "Save (API Format)" JSON here'
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="render-import-bindings">Bindings JSON</Label>
          <Textarea
            id="render-import-bindings"
            value={bindingsJson}
            onChange={(e) => setBindingsJson(e.target.value)}
            className="min-h-[80px] font-mono text-xs"
            placeholder='{"promptNodeId":"6","frameCountNodeId":"5",...}'
          />
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={importing}>
          {importing ? "Importing…" : "Import workflow template"}
        </Button>
      </form>
    </Card>
  );
}
