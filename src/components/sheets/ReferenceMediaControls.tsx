"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui/button";

interface ReferenceMediaControlsProps {
  apiBase: string;
  hasReference: boolean;
  onUpdated: () => void | Promise<void>;
  disabled?: boolean;
}

export function ReferenceMediaControls({
  apiBase,
  hasReference,
  onUpdated,
  disabled = false,
}: ReferenceMediaControlsProps) {
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(apiBase, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await Promise.resolve(onUpdated());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleUrlImport() {
    if (!url.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/import-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setUrl("");
      await Promise.resolve(onUpdated());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleClear() {
    if (!confirm("Remove this reference image?")) return;
    setClearing(true);
    setError(null);
    try {
      const res = await fetch(apiBase, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clear reference");
      await Promise.resolve(onUpdated());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear reference");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <p className="text-xs text-muted-foreground">
        Upload your own reference image or import from a URL.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`reference-upload-${apiBase}`}>Upload file</Label>
        <Input
          id={`reference-upload-${apiBase}`}
          type="file"
          accept="image/*,video/*"
          onChange={(e) => void handleUpload(e)}
          disabled={disabled || uploading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`reference-url-${apiBase}`}>Import from URL</Label>
        <div className="flex gap-2">
          <Input
            id={`reference-url-${apiBase}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            disabled={disabled || importing}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleUrlImport()}
            disabled={disabled || importing || !url.trim()}
          >
            {importing ? "…" : "Import"}
          </Button>
        </div>
      </div>

      {hasReference && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleClear()}
          disabled={disabled || clearing}
        >
          {clearing ? "Removing…" : "Remove reference"}
        </Button>
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
