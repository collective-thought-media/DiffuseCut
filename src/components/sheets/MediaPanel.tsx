"use client";

import { useState } from "react";
import type { MediaKind } from "@/types";
import { mediaUrl } from "@/lib/media-url";
import { Button, Input, Label, Card } from "@/components/ui/button";

type EntityType = "character" | "location" | "shot";

interface MediaPanelProps {
  projectId: string;
  entityType: EntityType;
  entityId: string;
  referencePath: string | null;
  referenceKind: MediaKind | null;
  /** Bust browser cache when the same path is overwritten (e.g. shot placeholder regen). */
  mediaVersion?: number | null;
  onMediaChange?: (path: string | null, kind: MediaKind | null) => void;
  /** When true, render inside a parent Card instead of wrapping in its own. */
  embedded?: boolean;
}

export function MediaPanel({
  projectId,
  entityType,
  entityId,
  referencePath,
  referenceKind,
  mediaVersion,
  onMediaChange,
  embedded = false,
}: MediaPanelProps) {
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSrc = referencePath
    ? mediaUrl(projectId, referencePath, { version: mediaVersion })
    : null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("entityType", entityType);
      formData.append("entityId", entityId);
      formData.append("file", file);

      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onMediaChange?.(data.relativePath ?? null, data.kind ?? null);
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
      const res = await fetch("/api/imports/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          projectId,
          entityType,
          entityId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      onMediaChange?.(data.relativePath ?? null, data.kind ?? null);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleClear() {
    onMediaChange?.(null, null);
  }

  const content = (
    <>
      <h3 className="font-medium">Reference Media</h3>

      {previewSrc ? (
        <div className="relative overflow-hidden rounded-lg bg-black">
          {referenceKind === "video" ? (
            <video
              src={previewSrc}
              controls
              className="max-h-64 w-full object-contain"
            />
          ) : (
            <img
              src={previewSrc}
              alt="Reference preview"
              className="max-h-64 w-full object-contain"
            />
          )}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg bg-black text-sm text-muted-foreground">
          No reference media
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`upload-${entityId}`}>Upload file</Label>
        <Input
          id={`upload-${entityId}`}
          type="file"
          accept="image/*,video/*"
          onChange={(e) => void handleUpload(e)}
          disabled={uploading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`url-${entityId}`}>Import from URL</Label>
        <div className="flex gap-2">
          <Input
            id={`url-${entityId}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleUrlImport()}
            disabled={importing || !url.trim()}
          >
            {importing ? "…" : "Import"}
          </Button>
        </div>
      </div>

      {referencePath && (
        <Button type="button" variant="outline" size="sm" onClick={handleClear}>
          Clear reference
        </Button>
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <Card className="space-y-4">
      {content}
    </Card>
  );
}
