"use client";

import { useEffect, useState } from "react";
import type { WorkflowTemplate } from "@/lib/db/schema";
import type { WorkflowBindings } from "@/types";
import { Button, Card, Input, Label, Textarea } from "@/components/ui/button";

interface TemplateBindingWizardProps {
  template: WorkflowTemplate | null;
  open: boolean;
  onClose: () => void;
  onSave: (bindings: WorkflowBindings) => Promise<void>;
}

export function TemplateBindingWizard({
  template,
  open,
  onClose,
  onSave,
}: TemplateBindingWizardProps) {
  const [bindingsJson, setBindingsJson] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (template?.bindingsJson) {
      try {
        setBindingsJson(
          JSON.stringify(JSON.parse(template.bindingsJson), null, 2)
        );
      } catch {
        setBindingsJson(template.bindingsJson);
      }
    }
  }, [template]);

  if (!open || !template) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const bindings = JSON.parse(bindingsJson) as WorkflowBindings;
      await onSave(bindings);
      onClose();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Bindings must be valid JSON");
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-neutral-900 p-6">
        <div>
          <h2 className="text-lg font-semibold">Binding Wizard</h2>
          <p className="text-sm text-muted-foreground">{template.name}</p>
        </div>

        <p className="text-sm text-muted-foreground">
          Map workflow node IDs to DiffuseCut roles (prompt, frame count,
          reference image, etc.).
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="prompt-node">Prompt node ID</Label>
          <Input id="prompt-node" placeholder='e.g. "6"' disabled className="opacity-50" />
          <p className="text-xs text-muted-foreground">
            Edit bindings JSON below for full control.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bindings-json">Bindings JSON</Label>
          <Textarea
            id="bindings-json"
            value={bindingsJson}
            onChange={(e) => setBindingsJson(e.target.value)}
            className="min-h-[200px] font-mono text-xs"
            placeholder='{"promptNodeId":"6","promptInputKey":"text",...}'
          />
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save bindings"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
