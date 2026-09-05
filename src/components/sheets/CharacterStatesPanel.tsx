"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CharacterAngle } from "@/lib/db/schema";
import type { CharacterStatePreview } from "@/lib/character-preview";
import {
  buildAnchoredCharacterAngleReferenceDescription,
  buildCharacterAngleReferenceDescription,
  resolveCharacterAnchorAngleName,
  resolveCharacterAnchorReferencePath,
  resolveCharacterFrontAngleId,
  resolveCharacterBackAngleId,
} from "@/lib/character-preview";
import { CharacterSheetGenerator } from "@/components/sheets/CharacterSheetGenerator";
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

interface CharacterStatesPanelProps {
  projectId: string;
  characterId: string;
  characterName: string;
  characterDescription: string;
  visualStyleJson?: string | null;
}

function characterAngleAnchorId(angleId: string): string {
  return `character-angle-${angleId}`;
}

export function CharacterStatesPanel({
  projectId,
  characterId,
  characterName,
  characterDescription,
  visualStyleJson,
}: CharacterStatesPanelProps) {
  const [states, setStates] = useState<CharacterStatePreview[]>([]);
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
        `/api/projects/${projectId}/characters/${characterId}/states`
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
  }, [projectId, characterId]);

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
        `/api/projects/${projectId}/characters/${characterId}/states/${stateId}`,
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
    [projectId, characterId]
  );

  const saveAngle = useCallback(
    async (
      stateId: string,
      angleId: string,
      patch: Partial<{ name: string; viewDescription: string }>,
      ctx: DebouncedSaveContext
    ) => {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/states/${stateId}/angles/${angleId}`,
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
    [projectId, characterId]
  );

  async function handleAddState() {
    if (!newStateName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/states`,
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
        `/api/projects/${projectId}/characters/${characterId}/states/${stateId}/angles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New angle",
            viewDescription: "",
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
        `/api/projects/${projectId}/characters/${characterId}/states/${stateId}/angles/${angleId}`,
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
        <h2 className="text-lg font-semibold">Visual States and Angles</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One character can have multiple looks across the film. Generate a
          reference sheet for each camera angle within each state, then pick
          which state appears in each shot on the storyboard.
        </p>
      </header>

      {error && (
        <p className="mb-8 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label htmlFor="new-state-name">Add visual state</Label>
          <Input
            id="new-state-name"
            value={newStateName}
            onChange={(e) => setNewStateName(e.target.value)}
            placeholder="e.g. Broken form, Restored angelic"
          />
        </div>
        <Button
          type="button"
          disabled={creating || !newStateName.trim()}
          onClick={() => void handleAddState()}
        >
          {creating ? "Adding…" : "Add state"}
        </Button>
      </Card>

      {states.map((state) => (
        <CharacterStateCard
          key={state.id}
          projectId={projectId}
          characterId={characterId}
          characterName={characterName}
          characterDescription={characterDescription}
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

function CharacterStateCard({
  projectId,
  characterId,
  characterName,
  characterDescription,
  state,
  visualStyleJson,
  onSave,
  onSaveAngle,
  onAddAngle,
  onDeleteAngle,
  onReferenceSelected,
}: {
  projectId: string;
  characterId: string;
  characterName: string;
  characterDescription: string;
  state: CharacterStatePreview;
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
            <Label htmlFor={`state-name-${state.id}`}>State name</Label>
            <Input
              id={`state-name-${state.id}`}
              {...bind("name", (next) => schedule(next))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`state-look-${state.id}`}>Look description</Label>
            <Textarea
              id={`state-look-${state.id}`}
              {...bind("lookDescription", (next) => schedule(next))}
              placeholder="Costume, hair, build, age. Photo-real projects generate one casting portrait per option."
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`state-timeline-${state.id}`}>When in the story</Label>
            <Textarea
              id={`state-timeline-${state.id}`}
              {...bind("timelineNote", (next) => schedule(next))}
              placeholder="e.g. Act 1 after the fall, before restoration in Act 3"
              className="min-h-[72px]"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Angles in this state</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Each angle is a pose or view you can generate and reference separately.
            </p>
          </div>

          {state.angles.length > 0 ? (
            <nav aria-label="Angles in this state">
              <ul className="space-y-2">
                {state.angles.map((angle) => (
                  <li key={angle.id}>
                    <a
                      href={`#${characterAngleAnchorId(angle.id)}`}
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
            <CharacterAngleSection
              key={angle.id}
              anchorId={characterAngleAnchorId(angle.id)}
              projectId={projectId}
              characterId={characterId}
              characterName={characterName}
              characterDescription={characterDescription}
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

function CharacterAngleSection({
  anchorId,
  projectId,
  characterId,
  characterName,
  characterDescription,
  state,
  angle,
  visualStyleJson,
  onSave,
  onDelete,
  onReferenceSelected,
}: {
  anchorId: string;
  projectId: string;
  characterId: string;
  characterName: string;
  characterDescription: string;
  state: CharacterStatePreview;
  angle: CharacterAngle;
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

  const { schedule, flush, saving, saved } = useDebouncedSave(onSave);

  const liveAngle = useMemo(
    () => ({
      ...angle,
      name: fields.name,
      viewDescription: fields.viewDescription,
    }),
    [angle, fields.name, fields.viewDescription]
  );

  const sheetDescription = buildCharacterAngleReferenceDescription(
    characterDescription,
    state,
    liveAngle
  );

  const previewSrc = angle.referencePath
    ? mediaUrl(projectId, angle.referencePath, { version: angle.updatedAt })
    : null;

  const anchorReferencePath = resolveCharacterAnchorReferencePath(state, angle.id);
  const anchorAngleName = resolveCharacterAnchorAngleName(state, angle.id);

  const batchReferenceDescription = anchorReferencePath
    ? buildAnchoredCharacterAngleReferenceDescription(
        characterDescription,
        state,
        liveAngle
      )
    : sheetDescription;

  const frontAngleId = resolveCharacterFrontAngleId(state, angle.id);
  const backAngleId = resolveCharacterBackAngleId(state, angle.id);
  const splitPairAngles =
    frontAngleId && backAngleId
      ? { frontAngleId, backAngleId }
      : null;

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
            <Label htmlFor={`char-angle-name-${angle.id}`}>Angle name</Label>
            <Input
              id={`char-angle-name-${angle.id}`}
              {...bind("name", (next) => schedule(next))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`char-angle-view-${angle.id}`}>View description</Label>
            <Textarea
              id={`char-angle-view-${angle.id}`}
              {...bind("viewDescription", (next) => schedule(next))}
              placeholder="Pose and framing: front full body, three-quarter portrait, profile close-up, etc."
              className="min-h-[88px]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Reference for this angle</Label>
          {previewSrc ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
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
            apiBase={`/api/projects/${projectId}/characters/${characterId}/states/${state.id}/angles/${angle.id}/reference`}
            hasReference={Boolean(angle.referencePath)}
            onUpdated={onReferenceSelected}
          />
        </div>
      </div>

      <CharacterSheetGenerator
        projectId={projectId}
        characterId={characterId}
        stateId={state.id}
        angleId={angle.id}
        characterName={`${characterName} (${fields.name})`}
        sheetDescription={sheetDescription}
        batchReferenceDescription={batchReferenceDescription}
        angleViewDescription={fields.viewDescription}
        onBeforeGenerate={async () => {
          await flush({
            name: fields.name,
            viewDescription: fields.viewDescription,
          });
        }}
        visualStyleJson={visualStyleJson}
        hasReference={Boolean(angle.referencePath)}
        usesFrontAnchor={Boolean(anchorReferencePath)}
        anchorAngleName={anchorAngleName}
        splitPairAngles={splitPairAngles}
        onReferenceSelected={onReferenceSelected}
      />
    </NestedEntityCard>
  );
}
