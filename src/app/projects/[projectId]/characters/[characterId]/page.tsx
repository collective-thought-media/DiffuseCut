"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Character } from "@/lib/db/schema";
import { CharacterStatesPanel } from "@/components/sheets/CharacterStatesPanel";
import {
  useDebouncedSave,
  type DebouncedSaveContext,
} from "@/lib/hooks/useDebouncedSave";
import { useSyncedEditableFields } from "@/lib/hooks/useSyncedEditableFields";
import { Card, Input, Label, Textarea, Badge } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/PageLoadingSkeleton";

type PageProps = {
  params: Promise<{ projectId: string; characterId: string }>;
};

export default function CharacterDetailPage({ params }: PageProps) {
  const { projectId, characterId } = use(params);
  const [character, setCharacter] = useState<Character | null>(null);
  const [visualStyleJson, setVisualStyleJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fieldSource = useMemo(
    () => ({
      name: character?.name ?? "",
      description: character?.description ?? "",
    }),
    [character?.id, character?.name, character?.description]
  );
  const { fields, bind } = useSyncedEditableFields(fieldSource, characterId);

  const loadCharacter = useCallback(async () => {
    setLoading(true);
    try {
      const [charRes, projectRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/characters/${characterId}`),
        fetch(`/api/projects/${projectId}`),
      ]);
      const data = await charRes.json();
      const projectData = await projectRes.json();
      if (!charRes.ok) throw new Error(data.error ?? "Not found");
      if (projectRes.ok) {
        setVisualStyleJson(projectData.project?.visualStyleJson ?? null);
      }
      setCharacter(data.character);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId, characterId]);

  useEffect(() => {
    void loadCharacter();
  }, [loadCharacter]);

  const saveFields = useCallback(
    async (
      nextFields: { name: string; description: string },
      ctx: DebouncedSaveContext
    ) => {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextFields),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (!ctx.isLatest()) return;
      setCharacter(data.character);
    },
    [projectId, characterId]
  );

  const { schedule, saving, saved } = useDebouncedSave(saveFields);

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  if (error || !character) {
    return (
      <p className="text-sm text-red-400" role="alert">
        {error ?? "Character not found"}
      </p>
    );
  }

  return (
    <div className="ui-fade-in space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-8">
        <div>
          <Link
            href={`/projects/${projectId}/characters`}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            ← Characters
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
        <h2 className="entity-card-header">Character Identity</h2>
        <div className="space-y-1.5">
          <Label htmlFor="char-name">Name</Label>
          <Input
            id="char-name"
            {...bind("name", (next) => schedule(next))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="char-desc">Character identity</Label>
          <Textarea
            id="char-desc"
            {...bind("description", (next) => schedule(next))}
            placeholder="Who they are across the whole film: age, role, personality, core features that stay constant."
            className="min-h-[120px]"
          />
        </div>
      </Card>

      <CharacterStatesPanel
        projectId={projectId}
        characterId={characterId}
        characterName={fields.name}
        characterDescription={fields.description}
        visualStyleJson={visualStyleJson}
      />
    </div>
  );
}
