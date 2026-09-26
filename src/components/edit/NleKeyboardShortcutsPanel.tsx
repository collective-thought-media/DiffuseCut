"use client";

import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
};

const ROWS: { keys: string; action: string }[] = [
  { keys: "Space", action: "Play / pause" },
  { keys: "Home / End", action: "Go to start / end of timeline" },
  { keys: "Left / Right", action: "Previous / next frame" },
  { keys: "S", action: "Split clip at playhead (V1)" },
  { keys: "Delete", action: "Remove selected clip" },
  { keys: "N", action: "Toggle snap to clips" },
  { keys: "F", action: "Fullscreen preview" },
  { keys: "Ctrl + = / Ctrl + -", action: "Zoom timeline in / out" },
  { keys: "?", action: "This shortcuts panel" },
];

export function NleKeyboardShortcutsPanel({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-labelledby="nle-shortcuts-title"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-lg border border-neutral-700 bg-neutral-950 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="nle-shortcuts-title" className="text-sm font-semibold">
            Edit keyboard shortcuts
          </h2>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <ul className="space-y-2 text-sm">
          {ROWS.map((row) => (
            <li
              key={row.keys}
              className="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2 last:border-0"
            >
              <span className="shrink-0 font-mono text-xs text-violet-300">
                {row.keys}
              </span>
              <span className="text-right text-muted-foreground">
                {row.action}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
