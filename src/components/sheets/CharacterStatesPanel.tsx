"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CharacterState } from "@/lib/db/schema";
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

export function CharacterStatesPanel({
  projectId,
  characterId,
  characterName,
  characterDescription,
  visualStyleJson,
}: CharacterStatesPanelProps) {
  const [states, setStates] = useState<CharacterState[]>([]);
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
      ctx: { isLatest: () => boolean }
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
        prev.map((state) => (state.id === stateId ? data.state : state))
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
        <h2 className="text-lg font-semibold">Visual States</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One character can have multiple looks across the film. Generate a
          reference sheet for each state, then pick which state appears in each
          shot on the storyboard.
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
  onReferenceSelected,
}: {
  projectId: string;
  characterId: string;
  characterName: string;
  characterDescription: string;
  state: CharacterState;
  visualStyleJson?: string | null;
  onSave: (
    patch: Partial<{
      name: string;
      lookDescription: string;
      timelineNote: string;
    }>,
    ctx: DebouncedSaveContext
  ) => Promise<void>;
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

  const sheetDescription = [
    characterDescription.trim(),
    fields.lookDescription.trim(),
  ]
    .filter(Boolean)
    .join(". ");

  const previewSrc = state.referencePath
    ? mediaUrl(projectId, state.referencePath, { version: state.updatedAt })
    : null;

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

        <div className="space-y-2">
          <Label>Reference for this state</Label>
          {previewSrc ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
              <img
                src={previewSrc}
                alt={`${state.name} reference`}
                key={state.updatedAt ?? state.id}
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
            apiBase={`/api/projects/${projectId}/characters/${characterId}/states/${state.id}/reference`}
            hasReference={Boolean(state.referencePath)}
            onUpdated={onReferenceSelected}
          />
        </div>
      </div>

      <CharacterSheetGenerator
        projectId={projectId}
        characterId={characterId}
        stateId={state.id}
        characterName={characterName}
        sheetDescription={sheetDescription}
        visualStyleJson={visualStyleJson}
        hasReference={Boolean(state.referencePath)}
        onReferenceSelected={onReferenceSelected}
      />
    </Card>
  );
}
