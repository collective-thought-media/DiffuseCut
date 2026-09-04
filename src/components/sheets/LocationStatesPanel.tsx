"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocationAngle } from "@/lib/db/schema";
import type { LocationStatePreview } from "@/lib/location-preview";
import {
  buildAngleReferenceDescription,
  resolveLocationAnchorAngleName,
  resolveLocationAnchorReferencePath,
} from "@/lib/location-preview";
import { LocationReferenceGenerator } from "@/components/sheets/LocationReferenceGenerator";
import { ReferenceMediaControls } from "@/components/sheets/ReferenceMediaControls";
import { useDebouncedSave, type DebouncedSaveContext } from "@/lib/hooks/useDebouncedSave";
import { useSyncedEditableFields } from "@/lib/hooks/useSyncedEditableFields";
import { mediaUrl } from "@/lib/media-url";
import { AsyncRefreshOverlay } from "@/components/ui/AsyncRefreshOverlay";
import { PageLoadingSkeleton } from "@/components/ui/PageLoadingSkeleton";
import {
  Button,
  Card,
  Input,
  Label,
  NestedEntityCard,
  Textarea,
  Badge,
} from "@/components/ui/button";

interface LocationStatesPanelProps {
  projectId: string;
  locationId: string;
  locationName: string;
  locationDescription: string;
  visualStyleJson?: string | null;
}

function locationAngleAnchorId(angleId: string): string {
  return `location-angle-${angleId}`;
}

export function LocationStatesPanel({
  projectId,
  locationId,
  locationName,
  locationDescription,
  visualStyleJson,
}: LocationStatesPanelProps) {
  const [states, setStates] = useState<LocationStatePreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStateName, setNewStateName] = useState("");
  const hasLoadedRef = useRef(false);

  const loadStates = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? hasLoadedRef.current;
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/locations/${locationId}/states`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load states");
      setStates(data.states ?? []);
      hasLoadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load states");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, locationId]);

  useEffect(() => {
    void loadStates();
  }, [loadStates]);

  const saveState = useCallback(
    async (
      stateId: string,
      patch: Partial<{
        name: string;
        lookDescription: string;
        timelineNote: string;
      }>,
      ctx: DebouncedSaveContext
    ) => {
      const res = await fetch(
        `/api/projects/${projectId}/locations/${locationId}/states/${stateId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save state");
      if (!ctx.isLatest()) return;
      setStates((prev) =>
        prev.map((state) =>
          state.id === stateId
            ? { ...state, ...data.state, angles: state.angles }
            : state
        )
      );
    },
    [projectId, locationId]
  );

  const saveAngle = useCallback(
    async (
      stateId: string,
      angleId: string,
      patch: Partial<{ name: string; viewDescription: string }>,
      ctx: DebouncedSaveContext
    ) => {
      const res = await fetch(
        `/api/projects/${projectId}/locations/${locationId}/states/${stateId}/angles/${angleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save angle");
      if (!ctx.isLatest()) return;
      setStates((prev) =>
        prev.map((state) =>
          state.id === stateId
            ? {
                ...state,
                angles: state.angles.map((angle) =>
                  angle.id === angleId ? data.angle : angle
                ),
              }
            : state
        )
      );
    },
    [projectId, locationId]
  );

  async function handleAddState() {
    if (!newStateName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/locations/${locationId}/states`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newStateName.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create state");
      setNewStateName("");
      await loadStates({ background: hasLoadedRef.current });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create state");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddAngle(stateId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/locations/${locationId}/states/${stateId}/angles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New angle",
            viewDescription: "Describe the camera position and framing",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create angle");
      await loadStates({ background: hasLoadedRef.current });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create angle");
    }
  }

  async function handleDeleteAngle(stateId: string, angleId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/locations/${locationId}/states/${stateId}/angles/${angleId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete angle");
      await loadStates({ background: hasLoadedRef.current });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete angle");
    }
  }

  if (loading && !hasLoadedRef.current) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="relative ui-fade-in">
      <AsyncRefreshOverlay active={refreshing} message="Updating assets…" />
      <div
        className={
          refreshing ? "ui-content-dim ui-content-dim-active" : "ui-content-dim"
        }
      >
      <header className="mb-8">
        <h2 className="text-lg font-semibold">Location States and Angles</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Track how a place changes across the story, then generate reference
          images for each camera angle within each state.
        </p>
      </header>

      <Card className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="new-location-state">Add story state</Label>
          <Input
            id="new-location-state"
            value={newStateName}
            onChange={(e) => setNewStateName(e.target.value)}
            placeholder="e.g. Before the fire, Restored sanctuary"
          />
        </div>
        <Button
          type="button"
          onClick={() => void handleAddState()}
          disabled={creating || !newStateName.trim()}
        >
          Add state
        </Button>
      </Card>

      {error && (
        <p className="mb-8 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {states.map((state) => (
        <LocationStateCard
          key={state.id}
          projectId={projectId}
          locationId={locationId}
          locationName={locationName}
          locationDescription={locationDescription}
          state={state}
          visualStyleJson={visualStyleJson}
          onSave={(patch, ctx) => saveState(state.id, patch, ctx)}
          onSaveAngle={(angleId, patch, ctx) =>
            saveAngle(state.id, angleId, patch, ctx)
          }
          onAddAngle={() => void handleAddAngle(state.id)}
          onDeleteAngle={(angleId) => void handleDeleteAngle(state.id, angleId)}
          onReferenceSelected={() => loadStates({ background: true })}
        />
      ))}
      </div>
    </div>
  );
}

function LocationStateCard({
  projectId,
  locationId,
  locationName,
  locationDescription,
  state,
  visualStyleJson,
  onSave,
  onSaveAngle,
  onAddAngle,
  onDeleteAngle,
  onReferenceSelected,
}: {
  projectId: string;
  locationId: string;
  locationName: string;
  locationDescription: string;
  state: LocationStatePreview;
  visualStyleJson?: string | null;
  onSave: (
    patch: Partial<{
      name: string;
      lookDescription: string;
      timelineNote: string;
    }>,
    ctx: DebouncedSaveContext
  ) => Promise<void>;
  onSaveAngle: (
    angleId: string,
    patch: Partial<{ name: string; viewDescription: string }>,
    ctx: DebouncedSaveContext
  ) => Promise<void>;
  onAddAngle: () => void;
  onDeleteAngle: (angleId: string) => void;
  onReferenceSelected: () => void | Promise<void>;
}) {
  const fieldSource = useMemo(
    () => ({
      name: state.name,
      lookDescription: state.lookDescription,
      timelineNote: state.timelineNote,
    }),
    [state.id, state.name, state.lookDescription, state.timelineNote]
  );
  const { fields, bind } = useSyncedEditableFields(fieldSource, state.id);

  const { schedule, saving, saved } = useDebouncedSave(onSave);

  return (
    <Card>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="entity-card-header mb-0">{fields.name}</h3>
        {saving ? (
          <Badge variant="warning">Saving…</Badge>
        ) : saved ? (
          <Badge variant="success">Saved</Badge>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`loc-state-name-${state.id}`}>State name</Label>
            <Input
              id={`loc-state-name-${state.id}`}
              {...bind("name", (next) => schedule(next))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`loc-state-look-${state.id}`}>Look for this state</Label>
            <Textarea
              id={`loc-state-look-${state.id}`}
              {...bind("lookDescription", (next) => schedule(next))}
              placeholder="Damage, season, lighting mood, set dressing changes, etc."
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`loc-state-timeline-${state.id}`}>When in the story</Label>
            <Textarea
              id={`loc-state-timeline-${state.id}`}
              {...bind("timelineNote", (next) => schedule(next))}
              placeholder="e.g. Act 1 arrival, Act 3 after the battle"
              className="min-h-[72px]"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Angles in this state</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Each angle is a camera view you can generate and reference separately.
            </p>
          </div>

          {state.angles.length > 0 ? (
            <nav aria-label="Angles in this state">
              <ul className="space-y-2">
                {state.angles.map((angle) => (
                  <li key={angle.id}>
                    <a
                      href={`#${locationAngleAnchorId(angle.id)}`}
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <span>{angle.name}</span>
                      {angle.referencePath && (
                        <span className="text-xs text-muted-foreground">
                          (reference saved)
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <p className="text-xs text-muted-foreground">No angles yet.</p>
          )}

          <Button type="button" variant="outline" size="sm" onClick={onAddAngle}>
            Add angle
          </Button>
        </div>
      </div>

      {state.angles.length > 0 && (
        <div className="mt-8 space-y-6 border-t border-neutral-800 pt-8">
          {state.angles.map((angle) => (
            <LocationAngleSection
              key={angle.id}
              anchorId={locationAngleAnchorId(angle.id)}
              projectId={projectId}
              locationId={locationId}
              locationName={locationName}
              locationDescription={locationDescription}
              state={state}
              angle={angle}
              visualStyleJson={visualStyleJson}
              onSave={(patch, ctx) => onSaveAngle(angle.id, patch, ctx)}
              onDelete={() => onDeleteAngle(angle.id)}
              onReferenceSelected={onReferenceSelected}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function LocationAngleSection({
  anchorId,
  projectId,
  locationId,
  locationName,
  locationDescription,
  state,
  angle,
  visualStyleJson,
  onSave,
  onDelete,
  onReferenceSelected,
}: {
  anchorId: string;
  projectId: string;
  locationId: string;
  locationName: string;
  locationDescription: string;
  state: LocationStatePreview;
  angle: LocationAngle;
  visualStyleJson?: string | null;
  onSave: (
    patch: Partial<{ name: string; viewDescription: string }>,
    ctx: DebouncedSaveContext
  ) => Promise<void>;
  onDelete: () => void;
  onReferenceSelected: () => void | Promise<void>;
}) {
  const fieldSource = useMemo(
    () => ({
      name: angle.name,
      viewDescription: angle.viewDescription,
    }),
    [angle.id, angle.name, angle.viewDescription]
  );
  const { fields, bind } = useSyncedEditableFields(fieldSource, angle.id);
  const [deleting, setDeleting] = useState(false);

  const { schedule, saving, saved } = useDebouncedSave(onSave);

  const referenceDescription = buildAngleReferenceDescription(
    locationDescription,
    state,
    angle
  );

  const previewSrc = angle.referencePath
    ? mediaUrl(projectId, angle.referencePath, { version: angle.updatedAt })
    : null;

  const anchorReferencePath = resolveLocationAnchorReferencePath(state, angle.id);
  const anchorAngleName = resolveLocationAnchorAngleName(state, angle.id);

  function handleDeleteAngle() {
    if (
      !confirm(
        `Delete "${angle.name}"? Its reference image and generation history will be removed.`
      )
    ) {
      return;
    }
    setDeleting(true);
    Promise.resolve(onDelete()).finally(() => setDeleting(false));
  }

  return (
    <NestedEntityCard id={anchorId} className="scroll-mt-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="entity-card-subheader mb-0">{fields.name}</h4>
        <div className="flex flex-wrap items-center gap-2">
          {saving ? (
            <Badge variant="warning">Saving…</Badge>
          ) : saved ? (
            <Badge variant="success">Saved</Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeleteAngle}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete angle"}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`angle-name-${angle.id}`}>Angle name</Label>
            <Input
              id={`angle-name-${angle.id}`}
              {...bind("name", (next) => schedule(next))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`angle-view-${angle.id}`}>View description</Label>
            <Textarea
              id={`angle-view-${angle.id}`}
              {...bind("viewDescription", (next) => schedule(next))}
              placeholder="Camera position: front facade, interior hall, rooftop, etc. For seamless backdrops: describe in-camera framing only, not studio gear."
              className="min-h-[88px]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Reference for this angle</Label>
          {previewSrc ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
              <img
                src={previewSrc}
                alt={`${angle.name} reference`}
                key={angle.updatedAt ?? angle.id}
                className="ui-image-enter h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900">
              <p className="px-4 text-center text-xs text-neutral-600">
                No reference yet. Upload an image or generate options below.
              </p>
            </div>
          )}
          <ReferenceMediaControls
            apiBase={`/api/projects/${projectId}/locations/${locationId}/states/${state.id}/angles/${angle.id}/reference`}
            hasReference={Boolean(angle.referencePath)}
            onUpdated={onReferenceSelected}
          />
        </div>
      </div>

      <LocationReferenceGenerator
        projectId={projectId}
        locationId={locationId}
        stateId={state.id}
        angleId={angle.id}
        locationName={`${locationName} (${angle.name})`}
        referenceDescription={referenceDescription}
        visualStyleJson={visualStyleJson}
        hasReference={Boolean(angle.referencePath)}
        usesEstablishingAnchor={Boolean(anchorReferencePath)}
        anchorAngleName={anchorAngleName}
        onReferenceSelected={onReferenceSelected}
      />
    </NestedEntityCard>
  );
}
