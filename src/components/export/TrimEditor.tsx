"use client";

import { useEffect, useRef, useState } from "react";
import type { Shot } from "@/lib/db/schema";
import {
  clampTrim,
  effectiveTrimFrames,
  trimPreviewFrameInShot,
  validateTrim,
} from "@/lib/finishing/trim";
import { durationMs } from "@/lib/timing/frames";
import { Button, Card, Input } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TrimUpdateOptions = {
  previewEdge?: "in" | "out" | "none";
};

interface TrimEditorProps {
  shots: Shot[];
  fps: number;
  selectedShotId?: string | null;
  showAllShots?: boolean;
  onToggleShowAll?: () => void;
  onSelectShot?: (shotId: string, frameInShot: number) => void;
  onUpdateTrim: (
    shotId: string,
    trimInFrames: number,
    trimOutFrames: number | null,
    options?: TrimUpdateOptions
  ) => void;
}

function TrimNumberInput({
  id,
  label,
  value,
  min,
  max,
  invalid,
  onChange,
  onFocusPreview,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  invalid?: boolean;
  onChange: (value: number) => void;
  onFocusPreview?: () => void;
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onChange(Math.min(max, value + step));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onChange(Math.max(min, value - step));
    }
  }

  return (
    <Input
      id={id}
      type="number"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      aria-invalid={invalid}
      className={cn(
        "h-7 w-[4.5rem] px-2 text-right text-xs tabular-nums",
        invalid && "border-red-500/70"
      )}
      onFocus={() => onFocusPreview?.()}
      onKeyDown={handleKeyDown}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

function TrimRow({
  shot,
  fps,
  selected,
  rowRef,
  onSelect,
  onUpdateTrim,
}: {
  shot: Shot;
  fps: number;
  selected: boolean;
  rowRef?: React.Ref<HTMLTableRowElement>;
  onSelect?: () => void;
  onUpdateTrim: TrimEditorProps["onUpdateTrim"];
}) {
  const maxFrames = shot.durationFrames;
  const trimOut = shot.trimOutFrames ?? maxFrames;
  const effective = effectiveTrimFrames(shot.trimInFrames, trimOut);
  const validationError = validateTrim(
    maxFrames,
    shot.trimInFrames,
    trimOut
  );

  function updateTrimIn(nextIn: number) {
    const clamped = clampTrim(maxFrames, nextIn, trimOut);
    onUpdateTrim(shot.id, clamped.trimInFrames, clamped.trimOutFrames, {
      previewEdge: "in",
    });
  }

  function updateTrimOut(nextOut: number) {
    const clamped = clampTrim(maxFrames, shot.trimInFrames, nextOut);
    onUpdateTrim(shot.id, clamped.trimInFrames, clamped.trimOutFrames, {
      previewEdge: "out",
    });
  }

  return (
    <tr
      ref={rowRef}
      className={cn(
        "cursor-pointer border-b border-neutral-800/50 last:border-0",
        selected && "bg-primary/5"
      )}
      onClick={onSelect}
    >
      <td className="max-w-[12rem] px-3 py-1.5">
        <span
          className={cn("line-clamp-1 text-sm", selected && "font-medium text-primary")}
          title={`${maxFrames}f · ${(durationMs(maxFrames, fps) / 1000).toFixed(2)}s`}
        >
          {shot.title || "Untitled"}
        </span>
      </td>
      <td className="px-3 py-1.5 text-right">
        <TrimNumberInput
          id={`trim-in-${shot.id}`}
          label={`Trim in for ${shot.title || "shot"}`}
          value={shot.trimInFrames}
          min={0}
          max={maxFrames - 1}
          invalid={Boolean(validationError)}
          onChange={updateTrimIn}
          onFocusPreview={() =>
            onUpdateTrim(shot.id, shot.trimInFrames, trimOut, {
              previewEdge: "in",
            })
          }
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <TrimNumberInput
          id={`trim-out-${shot.id}`}
          label={`Trim out for ${shot.title || "shot"}`}
          value={trimOut}
          min={1}
          max={maxFrames}
          invalid={Boolean(validationError)}
          onChange={updateTrimOut}
          onFocusPreview={() =>
            onUpdateTrim(shot.id, shot.trimInFrames, trimOut, {
              previewEdge: "out",
            })
          }
        />
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
        {effective}f
        {validationError && (
          <span className="ml-2 text-red-400">{validationError}</span>
        )}
      </td>
    </tr>
  );
}

export function TrimEditor({
  shots,
  fps,
  selectedShotId,
  showAllShots = false,
  onToggleShowAll,
  onSelectShot,
  onUpdateTrim,
}: TrimEditorProps) {
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (showAllShots && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selectedShotId, showAllShots]);

  if (shots.length === 0) {
    return (
      <Card className="mb-0 text-center text-sm text-muted-foreground">
        No shots to trim. Render shots first on the Render page.
      </Card>
    );
  }

  const selectedShot =
    shots.find((shot) => shot.id === selectedShotId) ?? shots[0] ?? null;

  return (
    <div className="space-y-2">
      {selectedShot && !showAllShots && (
        <Card className="mb-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {selectedShot.title || "Untitled"}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedShot.durationFrames}f total · drag clip handles or edit
                in/out
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor={`trim-in-${selectedShot.id}`}>
                In
              </label>
              <TrimNumberInput
                id={`trim-in-${selectedShot.id}`}
                label={`Trim in for ${selectedShot.title || "shot"}`}
                value={selectedShot.trimInFrames}
                min={0}
                max={selectedShot.durationFrames - 1}
                onChange={(value) => {
                  const clamped = clampTrim(
                    selectedShot.durationFrames,
                    value,
                    selectedShot.trimOutFrames
                  );
                  onUpdateTrim(
                    selectedShot.id,
                    clamped.trimInFrames,
                    clamped.trimOutFrames,
                    { previewEdge: "in" }
                  );
                }}
                onFocusPreview={() =>
                  onUpdateTrim(
                    selectedShot.id,
                    selectedShot.trimInFrames,
                    selectedShot.trimOutFrames,
                    { previewEdge: "in" }
                  )
                }
              />
              <label className="text-xs text-muted-foreground" htmlFor={`trim-out-${selectedShot.id}`}>
                Out
              </label>
              <TrimNumberInput
                id={`trim-out-${selectedShot.id}`}
                label={`Trim out for ${selectedShot.title || "shot"}`}
                value={selectedShot.trimOutFrames ?? selectedShot.durationFrames}
                min={1}
                max={selectedShot.durationFrames}
                onChange={(value) => {
                  const clamped = clampTrim(
                    selectedShot.durationFrames,
                    selectedShot.trimInFrames,
                    value
                  );
                  onUpdateTrim(
                    selectedShot.id,
                    clamped.trimInFrames,
                    clamped.trimOutFrames,
                    { previewEdge: "out" }
                  );
                }}
                onFocusPreview={() =>
                  onUpdateTrim(
                    selectedShot.id,
                    selectedShot.trimInFrames,
                    selectedShot.trimOutFrames,
                    { previewEdge: "out" }
                  )
                }
              />
              <span className="text-xs tabular-nums text-muted-foreground">
                {effectiveTrimFrames(
                  selectedShot.trimInFrames,
                  selectedShot.trimOutFrames ?? selectedShot.durationFrames
                )}
                f effective
              </span>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Export uses the in/out range per shot.
        </p>
        {onToggleShowAll && (
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onToggleShowAll}
          >
            {showAllShots ? "Selected shot only" : "Show all shots"}
          </Button>
        )}
      </div>

      {showAllShots && (
        <Card className="mb-0 max-h-64 overflow-hidden p-0">
          <div className="scrollbar-thin max-h-64 overflow-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-950/95">
                <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Shot</th>
                  <th className="w-24 px-3 py-2 text-right font-medium">In</th>
                  <th className="w-24 px-3 py-2 text-right font-medium">Out</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">
                    Effective
                  </th>
                </tr>
              </thead>
              <tbody>
                {shots.map((shot) => (
                  <TrimRow
                    key={shot.id}
                    shot={shot}
                    fps={fps}
                    selected={selectedShotId === shot.id}
                    rowRef={selectedShotId === shot.id ? selectedRowRef : undefined}
                    onSelect={() =>
                      onSelectShot?.(
                        shot.id,
                        trimPreviewFrameInShot(
                          shot.durationFrames,
                          shot.trimInFrames,
                          shot.trimOutFrames ?? shot.durationFrames,
                          "in"
                        )
                      )
                    }
                    onUpdateTrim={onUpdateTrim}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
