"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Location } from "@/lib/db/schema";
import { LocationStatesPanel } from "@/components/sheets/LocationStatesPanel";
import {
  useDebouncedSave,
  type DebouncedSaveContext,
} from "@/lib/hooks/useDebouncedSave";
import { useSyncedEditableFields } from "@/lib/hooks/useSyncedEditableFields";
import { Card, Input, Label, Textarea, Badge } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/PageLoadingSkeleton";

type PageProps = {
  params: Promise<{ projectId: string; locationId: string }>;
};

export default function LocationDetailPage({ params }: PageProps) {
  const { projectId, locationId } = use(params);
  const [location, setLocation] = useState<Location | null>(null);
  const [visualStyleJson, setVisualStyleJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fieldSource = useMemo(
    () => ({
      name: location?.name ?? "",
      description: location?.description ?? "",
    }),
    [location?.id, location?.name, location?.description]
  );
  const { fields, bind } = useSyncedEditableFields(fieldSource, locationId);

  const loadLocation = useCallback(async () => {
    setLoading(true);
    try {
      const [locRes, projectRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/locations/${locationId}`),
        fetch(`/api/projects/${projectId}`),
      ]);
      const data = await locRes.json();
      const projectData = await projectRes.json();
      if (!locRes.ok) throw new Error(data.error ?? "Not found");
      if (projectRes.ok) {
        setVisualStyleJson(projectData.project?.visualStyleJson ?? null);
      }
      setLocation(data.location);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId, locationId]);

  useEffect(() => {
    void loadLocation();
  }, [loadLocation]);

  const saveFields = useCallback(
    async (
      nextFields: { name: string; description: string },
      ctx: DebouncedSaveContext
    ) => {
      const res = await fetch(
        `/api/projects/${projectId}/locations/${locationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextFields),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (!ctx.isLatest()) return;
      setLocation(data.location);
    },
    [projectId, locationId]
  );

  const { schedule, saving, saved } = useDebouncedSave(saveFields);

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  if (error || !location) {
    return (
      <p className="text-sm text-red-400" role="alert">
        {error ?? "Location not found"}
      </p>
    );
  }

  return (
    <div className="ui-fade-in space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-8">
        <div>
          <Link
            href={`/projects/${projectId}/locations`}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            ← Locations
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{fields.name}</h1>
        </div>
        {saving ? (
          <Badge variant="warning">Saving…</Badge>
        ) : saved ? (
          <Badge variant="success">Saved</Badge>
        ) : (
          <Badge>Unsaved</Badge>
        )}
      </div>

      <Card>
        <h2 className="entity-card-header">Location Description</h2>
        <div className="space-y-1.5">
          <Label htmlFor="loc-name">Name</Label>
          <Input
            id="loc-name"
            {...bind("name", (next) => schedule(next))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loc-desc">Description</Label>
          <Textarea
            id="loc-desc"
            {...bind("description", (next) => schedule(next))}
            placeholder="What this place is: architecture, era, mood, story role"
            className="min-h-[120px]"
          />
        </div>
      </Card>

      <LocationStatesPanel
        projectId={projectId}
        locationId={locationId}
        locationName={fields.name}
        locationDescription={fields.description}
        visualStyleJson={visualStyleJson}
      />
    </div>
  );
}
