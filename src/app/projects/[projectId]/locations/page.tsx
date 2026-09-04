"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Location } from "@/lib/db/schema";
import { CharacterCardThumbnail } from "@/components/characters/CharacterCardThumbnail";
import {
  countLocationThumbnailVariants,
  listLocationAnglePreviewSources,
  type LocationStatePreview,
} from "@/lib/location-preview";
import { Button, Card, Input, Badge } from "@/components/ui/button";
import { ProjectStepNav } from "@/components/project/ProjectStepNav";

type LocationWithStates = Location & { states: LocationStatePreview[] };

type PageProps = { params: Promise<{ projectId: string }> };

export default function LocationsPage({ params }: PageProps) {
  const { projectId } = use(params);
  const [locations, setLocations] = useState<LocationWithStates[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/locations`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setLocations(data.locations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setName("");
      await loadLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Locations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your environments at a glance. Locations with multiple story states
          cycle through their looks on this page.
        </p>
      </div>

      <Card className="max-w-md space-y-3">
        <h2 className="font-medium">Add Location</h2>
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Location name"
            className="flex-1"
          />
          <Button type="submit" disabled={creating || !name.trim()}>
            Add
          </Button>
        </form>
      </Card>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {loading && locations.length === 0 ? (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2].map((slot) => (
            <Card
              key={slot}
              className="flex h-full flex-col overflow-hidden p-0 animate-pulse"
            >
              <div className="aspect-square bg-muted" />
              <div className="flex flex-1 flex-col p-3">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="mt-1.5 h-10 w-full rounded bg-muted" />
                <div className="mt-1.5 h-8 w-full rounded bg-muted" />
              </div>
            </Card>
          ))}
        </div>
      ) : locations.length === 0 ? (
        <Card className="text-center text-muted-foreground">
          No locations yet.
        </Card>
      ) : (
        <div
          className={`grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ui-content-dim${
            loading ? " ui-content-dim-active" : ""
          }`}
        >
          {locations.map((location) => {
            const states = location.states ?? [];
            const stateNames = states.map((state) => state.name).join(" · ");
            const previewPaths = listLocationAnglePreviewSources(states);
            const variantCount = countLocationThumbnailVariants(states);

            return (
              <Link
                key={location.id}
                href={`/projects/${projectId}/locations/${location.id}`}
                className="group block h-full"
              >
              <Card className="flex h-full flex-col overflow-hidden p-0 transition duration-300 group-hover:opacity-90">
                  <div className="overflow-hidden">
                    <div className="transition duration-500 group-hover:scale-[1.02]">
                      <CharacterCardThumbnail
                        projectId={projectId}
                        characterName={location.name}
                        previewItems={previewPaths.map((referencePath) => ({
                          referencePath,
                          referenceKind: "image" as const,
                        }))}
                        variantCount={variantCount}
                        animateMultipleSources
                        fallbackReferencePath={location.referencePath}
                      />
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium leading-tight group-hover:text-primary">
                        {location.name}
                      </h3>
                      {location.referenceKind && (
                        <Badge className="shrink-0 text-[10px]">
                          {location.referenceKind}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                      {location.description || "\u00A0"}
                    </p>

                    <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                      {stateNames || "Default look"}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectStepNav projectId={projectId} currentSegment="locations" />
    </div>
  );
}
