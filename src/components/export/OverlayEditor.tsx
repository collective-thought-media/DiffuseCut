"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Textarea } from "@/components/ui/button";

export interface TextOverlayDraft {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
  shotId?: string | null;
}

interface OverlayEditorProps {
  overlays: TextOverlayDraft[];
  totalFrames: number;
  onChange: (overlays: TextOverlayDraft[]) => void;
  onSave: () => Promise<void>;
  saving?: boolean;
}

export function OverlayEditor({
  overlays,
  totalFrames,
  onChange,
  onSave,
  saving,
}: OverlayEditorProps) {
  const [error, setError] = useState<string | null>(null);

  function addOverlay() {
    onChange([
      ...overlays,
      {
        id: crypto.randomUUID(),
        text: "New overlay",
        startFrame: 0,
        endFrame: Math.min(72, totalFrames),
      },
    ]);
  }

  function updateOverlay(id: string, patch: Partial<TextOverlayDraft>) {
    onChange(
      overlays.map((o) => (o.id === id ? { ...o, ...patch } : o))
    );
  }

  function removeOverlay(id: string) {
    onChange(overlays.filter((o) => o.id !== id));
  }

  async function handleSave() {
    setError(null);
    try {
      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Text Overlays</h3>
        <Button size="sm" variant="secondary" onClick={addOverlay}>
          Add overlay
        </Button>
      </div>

      {overlays.length === 0 ? (
        <Card className="text-center text-muted-foreground">
          No text overlays. Add one to burn titles into the export.
        </Card>
      ) : (
        overlays.map((overlay) => (
          <Card key={overlay.id} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`overlay-text-${overlay.id}`}>Text</Label>
              <Textarea
                id={`overlay-text-${overlay.id}`}
                value={overlay.text}
                onChange={(e) =>
                  updateOverlay(overlay.id, { text: e.target.value })
                }
                className="min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`overlay-start-${overlay.id}`}>
                  Start frame
                </Label>
                <Input
                  id={`overlay-start-${overlay.id}`}
                  type="number"
                  min={0}
                  max={totalFrames}
                  value={overlay.startFrame}
                  onChange={(e) =>
                    updateOverlay(overlay.id, {
                      startFrame: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`overlay-end-${overlay.id}`}>End frame</Label>
                <Input
                  id={`overlay-end-${overlay.id}`}
                  type="number"
                  min={0}
                  max={totalFrames}
                  value={overlay.endFrame}
                  onChange={(e) =>
                    updateOverlay(overlay.id, {
                      endFrame: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => removeOverlay(overlay.id)}
            >
              Remove
            </Button>
          </Card>
        ))
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {overlays.length > 0 && (
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving overlays…" : "Save overlays"}
        </Button>
      )}
    </div>
  );
}
