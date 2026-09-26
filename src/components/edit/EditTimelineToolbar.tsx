"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Blend,
  Clapperboard,
  Keyboard,
  Magnet,
  Maximize2,
  MoveHorizontal,
  Scissors,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimelineTransitionType } from "@/lib/timeline/types";
import {
  EXPORT_QUALITY_PRESETS,
  TIMELINE_FORMAT_PRESETS,
  type ExportQualityPreset,
} from "@/lib/timeline/format-presets";
import { withSequenceId } from "@/lib/sequence-api-url";

const TRANSITION_OPTIONS: {
  type: TimelineTransitionType;
  label: string;
}[] = [
  { type: "fade_black", label: "Fade to black" },
  { type: "fade_white", label: "Fade to white" },
  { type: "dissolve", label: "Cross dissolve" },
  { type: "wipe_left", label: "Wipe left" },
  { type: "wipe_right", label: "Wipe right" },
];

type Props = {
  projectId: string;
  sequenceId: string;
  snapEnabled: boolean;
  onSnapEnabledChange: (value: boolean) => void;
  formatPresetId: string;
  onFormatPresetChange: (presetId: string) => void;
  pxPerFrame: number;
  onPxPerFrameChange: (value: number) => void;
  onZoomToFit: () => void;
  onFullscreenPreview: () => void;
  exportPreset: ExportQualityPreset;
  onExportPresetChange: (preset: ExportQualityPreset) => void;
  canSplit: boolean;
  onSplit: () => void;
  canDelete: boolean;
  onDelete: () => void;
  onApplyTransition: (type: TimelineTransitionType) => void;
  onSyncFromStoryboard: () => void;
  saving?: boolean;
  onShowShortcuts: () => void;
};

export function EditTimelineToolbar({
  projectId,
  sequenceId,
  snapEnabled,
  onSnapEnabledChange,
  formatPresetId,
  onFormatPresetChange,
  pxPerFrame,
  onPxPerFrameChange,
  onZoomToFit,
  onFullscreenPreview,
  exportPreset,
  onExportPresetChange,
  canSplit,
  onSplit,
  canDelete,
  onDelete,
  onApplyTransition,
  onSyncFromStoryboard,
  saving,
  onShowShortcuts,
}: Props) {
  const [showTransitions, setShowTransitions] = useState(false);
  const transitionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTransitions) return;
    const onDoc = (e: MouseEvent) => {
      if (
        transitionRef.current &&
        !transitionRef.current.contains(e.target as Node)
      ) {
        setShowTransitions(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showTransitions]);

  const exportHref = withSequenceId(
    `/projects/${projectId}/export`,
    sequenceId
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          onClick={() => void onSyncFromStoryboard()}
        >
          Re-sync storyboard
        </Button>

        <ToolbarDivider />

        <ToolbarIconButton
          title="Split at playhead (S)"
          disabled={!canSplit}
          onClick={onSplit}
        >
          <Scissors className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton
          title="Delete selected clip"
          disabled={!canDelete}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </ToolbarIconButton>

        <ToolbarDivider />

        <ToolbarIconButton
          title="Toggle snap to clips (N)"
          active={snapEnabled}
          onClick={() => onSnapEnabledChange(!snapEnabled)}
        >
          <Magnet className="h-4 w-4" />
        </ToolbarIconButton>

        <div className="relative" ref={transitionRef}>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition hover:bg-neutral-800 hover:text-neutral-100"
            onClick={() => setShowTransitions((v) => !v)}
            title="Apply transition out on selected V1 clip"
          >
            <Blend className="h-4 w-4 text-violet-400" />
            Transition
          </button>
          {showTransitions ? (
            <div className="absolute left-0 top-8 z-40 min-w-[200px] rounded-md border border-neutral-700 bg-neutral-950 py-1 shadow-lg">
              {TRANSITION_OPTIONS.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-neutral-800"
                  onClick={() => {
                    onApplyTransition(t.type);
                    setShowTransitions(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
              <p className="border-t border-neutral-800 px-3 py-1.5 text-[10px] text-muted-foreground">
                Applies to selected video clip, paired with the next clip when
                possible.
              </p>
            </div>
          ) : null}
        </div>

        {saving ? (
          <span className="px-1 text-[10px] text-muted-foreground">Saving…</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          className="h-7 cursor-pointer rounded-md border border-neutral-700 bg-neutral-950 px-2 text-xs text-muted-foreground"
          value={formatPresetId}
          onChange={(e) => onFormatPresetChange(e.target.value)}
          title="Timeline format (preview and export framing)"
        >
          {TIMELINE_FORMAT_PRESETS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} ({f.width}x{f.height})
            </option>
          ))}
        </select>

        <ToolbarDivider />

        <ToolbarIconButton
          title="Zoom out"
          onClick={() => onPxPerFrameChange(Math.max(1, pxPerFrame - 1))}
        >
          <ZoomOut className="h-4 w-4" />
        </ToolbarIconButton>
        <input
          type="range"
          min={1}
          max={24}
          step={1}
          value={pxPerFrame}
          onChange={(e) => onPxPerFrameChange(Number(e.target.value) || 3)}
          className="w-16 accent-violet-500"
          title="Timeline zoom"
        />
        <ToolbarIconButton
          title="Zoom in"
          onClick={() => onPxPerFrameChange(Math.min(24, pxPerFrame + 1))}
        >
          <ZoomIn className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton title="Zoom to fit" onClick={onZoomToFit}>
          <MoveHorizontal className="h-3.5 w-3.5" />
        </ToolbarIconButton>

        <ToolbarDivider />

        <ToolbarIconButton title="Fullscreen preview (F)" onClick={onFullscreenPreview}>
          <Maximize2 className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton title="Keyboard shortcuts (?)" onClick={onShowShortcuts}>
          <Keyboard className="h-4 w-4" />
        </ToolbarIconButton>

        <ToolbarDivider />

        <select
          className="h-7 cursor-pointer rounded-md border border-neutral-700 bg-neutral-950 px-2 text-xs text-muted-foreground"
          value={exportPreset}
          onChange={(e) =>
            onExportPresetChange(e.target.value as ExportQualityPreset)
          }
          title="Export quality preset (used on Export tab)"
        >
          {EXPORT_QUALITY_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <Link
          href={exportHref}
          onClick={() => {
            try {
              sessionStorage.setItem(
                `diffusecut-export-preset-${projectId}`,
                exportPreset
              );
            } catch {
              /* ignore */
            }
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-700/40 bg-emerald-950/40 px-3 text-xs font-medium text-emerald-300 transition hover:bg-emerald-900/50"
          title="Open Export tab for this sequence"
        >
          <Clapperboard className="h-3.5 w-3.5" />
          Render
        </Link>
      </div>
    </div>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px bg-neutral-700/80" aria-hidden />;
}

function ToolbarIconButton({
  children,
  title,
  disabled,
  active,
  onClick,
}: {
  children: ReactNode;
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:opacity-20 ${
        active
          ? "bg-violet-600/20 text-violet-300"
          : "text-muted-foreground hover:bg-neutral-800 hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
