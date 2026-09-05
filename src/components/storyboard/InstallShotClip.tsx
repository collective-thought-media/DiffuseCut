"use client";

import { useState } from "react";
import type { Shot } from "@/lib/db/schema";
import { Button, Input, Label } from "@/components/ui/button";

type InstallShotClipProps = {
  projectId: string;
  shotId: string;
  onInstalled?: (shot: Shot) => void;
};

export function InstallShotClip({
  projectId,
  shotId,
  onInstalled,
}: InstallShotClipProps) {
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/projects/${projectId}/shots/${shotId}/install-video`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not install clip");
      onInstalled?.(data.shot as Shot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not install clip");
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
      const res = await fetch(
        `/api/projects/${projectId}/shots/${shotId}/install-video`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not install clip");
      onInstalled?.(data.shot as Shot);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not install clip");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Install clip</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Attach a finished video from another tool. Finishing and export use
          this as the shot.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`install-clip-${shotId}`}>Upload video</Label>
        <Input
          id={`install-clip-${shotId}`}
          type="file"
          accept="video/*"
          onChange={(e) => void handleUpload(e)}
          disabled={uploading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`install-url-${shotId}`}>Import video URL</Label>
        <div className="flex gap-2">
          <Input
            id={`install-url-${shotId}`}
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
            {importing ? "…" : "Install"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
