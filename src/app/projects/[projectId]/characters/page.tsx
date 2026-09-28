"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
  CharacterCardThumbnail,
  type CharacterWithStates,
} from "@/components/characters/CharacterCardThumbnail";
import { Button, Card, Input, Badge } from "@/components/ui/button";
import { ProjectStepNav } from "@/components/project/ProjectStepNav";

type PageProps = { params: Promise<{ projectId: string }> };

export default function CharactersPage({ params }: PageProps) {
  const { projectId } = use(params);
  const [characters, setCharacters] = useState<CharacterWithStates[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CharacterWithStates | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const loadCharacters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/characters`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setCharacters(data.characters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadCharacters();
  }, [loadCharacters]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setName("");
      await loadCharacters();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirmDelete(confirmed: boolean) {
    if (!confirmed || !pendingDelete) {
      setPendingDelete(null);
      return;
    }

    const character = pendingDelete;
    setPendingDelete(null);
    setDeletingId(character.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${character.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete character");
      setCharacters((prev) => prev.filter((c) => c.id !== character.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete character");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Characters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your cast at a glance. Characters with multiple visual states cycle
          through their looks on this page.
        </p>
      </div>

      <Card className="max-w-md space-y-3">
        <h2 className="font-medium">Add Character</h2>
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
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

      {loading && characters.length === 0 ? (
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
      ) : characters.length === 0 ? (
        <Card className="text-center text-muted-foreground">
          No characters yet.
        </Card>
      ) : (
        <div
          className={`grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ui-content-dim${
            loading ? " ui-content-dim-active" : ""
          }`}
        >
          {characters.map((character) => {
            const stateNames = (character.states ?? [])
              .map((state) => state.name)
              .join(" · ");

            const detailHref = `/projects/${projectId}/characters/${character.id}`;
            const isDeleting = deletingId === character.id;

            return (
              <Card
                key={character.id}
                className="group flex h-full flex-col overflow-hidden p-0 transition duration-300 group-hover:opacity-90"
              >
                <div className="relative overflow-hidden">
                  <Link href={detailHref} className="block">
                    <div className="transition duration-500 group-hover:scale-[1.02]">
                      <CharacterCardThumbnail
                        projectId={projectId}
                        characterName={character.name}
                        states={character.states ?? []}
                        fallbackReferencePath={character.referencePath}
                      />
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${character.name}`}
                    disabled={isDeleting}
                    className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white/90 backdrop-blur-sm transition hover:bg-red-900/90 hover:text-white disabled:opacity-50"
                    onClick={() => setPendingDelete(character)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <Link href={detailHref} className="flex flex-1 flex-col p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium leading-tight group-hover:text-primary">
                      {character.name}
                    </h3>
                    {character.referenceKind && (
                      <Badge className="shrink-0 text-[10px]">
                        {character.referenceKind}
                      </Badge>
                    )}
                  </div>

                  <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                    {character.description || "\u00A0"}
                  </p>

                  <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                    {stateNames || "Default look"}
                  </p>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-character-title"
        >
          <Card className="w-full max-w-sm space-y-4 p-5 shadow-xl">
            <div>
              <h2
                id="delete-character-title"
                className="text-base font-medium text-foreground"
              >
                Do you want to delete this character?
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {pendingDelete.name} will be removed from this project, including
                reference sheets and cast links on shots.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleConfirmDelete(false)}
              >
                No
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleConfirmDelete(true)}
              >
                Yes
              </Button>
            </div>
          </Card>
        </div>
      )}

      <ProjectStepNav projectId={projectId} currentSegment="characters" />
    </div>
  );
}
