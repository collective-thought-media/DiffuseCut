"use client";

import { useState } from "react";
import type { Sequence } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";

type Props = {
  projectId: string;
  sequences: Sequence[];
  activeSequenceId: string | null;
  onSelect: (sequenceId: string) => void;
  onChanged: () => void;
  /** Storyboard: one default bin; manage extra sequences from Edit when needed. */
  variant?: "default" | "storyboard";
};

export function SequenceSwitcher({
  projectId,
  sequences,
  activeSequenceId,
  onSelect,
  onChanged,
  variant = "default",
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const active =
    sequences.find((s) => s.id === activeSequenceId) ?? sequences[0] ?? null;

  async function createSequence() {
    setBusy("create");
    try {
      const res = await fetch(`/api/projects/${projectId}/sequences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Sequence ${sequences.length + 1}` }),
      });
      const data = await res.json();
      if (res.ok && data.sequence?.id) {
        onChanged();
        onSelect(data.sequence.id);
      }
    } finally {
      setBusy(null);
    }
  }

  async function duplicateSequence() {
    if (!activeSequenceId) return;
    setBusy("duplicate");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sequences/${activeSequenceId}/duplicate`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      const data = await res.json();
      if (res.ok && data.sequence?.id) {
        onChanged();
        onSelect(data.sequence.id);
      }
    } finally {
      setBusy(null);
    }
  }

  if (sequences.length === 0) {
    return null;
  }

  if (variant === "storyboard" && sequences.length === 1 && active) {
    return (
      <p className="text-xs text-muted-foreground">
        Storyboard sequence:{" "}
        <span className="text-foreground">{active.name}</span>
      </p>
    );
  }

  const showManage = variant !== "storyboard" || sequences.length > 1;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-muted-foreground" htmlFor="sequence-select">
        Sequence
      </label>
      <select
        id="sequence-select"
        className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm"
        value={activeSequenceId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        {sequences.map((seq) => (
          <option key={seq.id} value={seq.id}>
            {seq.name}
          </option>
        ))}
      </select>
      {showManage ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy != null}
            onClick={() => void createSequence()}
          >
            {busy === "create" ? "Creating…" : "Add sequence"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!activeSequenceId || busy != null}
            onClick={() => void duplicateSequence()}
          >
            {busy === "duplicate" ? "Duplicating…" : "Duplicate"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
