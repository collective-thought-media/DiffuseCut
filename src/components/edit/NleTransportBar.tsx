"use client";

import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  formatSmpteTimecode,
  formatTimelineDurationSeconds,
} from "@/lib/timing/smpte";

type Props = {
  playing: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  disabled?: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (frame: number) => void;
  onFrameStep: (delta: number) => void;
};

export function NleTransportBar({
  playing,
  currentFrame,
  totalFrames,
  fps,
  disabled,
  onPlayPause,
  onStop,
  onSeek,
  onFrameStep,
}: Props) {
  const maxFrame = Math.max(0, totalFrames - 1);
  const scrubPct =
    maxFrame > 0 ? (currentFrame / maxFrame) * 100 : 0;

  return (
    <div className="space-y-2.5 rounded-md border border-neutral-800 bg-neutral-950/80 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div
          className="rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 font-mono text-xs tabular-nums tracking-wider text-neutral-200"
          title="Timeline timecode"
        >
          {formatSmpteTimecode(currentFrame, fps)}
        </div>

        <div className="flex items-center gap-0.5">
          <TransportIconButton
            disabled={disabled}
            title="Go to start (Home)"
            onClick={() => {
              onStop();
              onSeek(0);
            }}
          >
            <SkipBack className="h-4 w-4" />
          </TransportIconButton>
          <TransportIconButton
            disabled={disabled}
            title="Previous frame"
            onClick={() => onFrameStep(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </TransportIconButton>
          <button
            type="button"
            disabled={disabled}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            onClick={onPlayPause}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-white shadow-md shadow-violet-900/30 transition hover:bg-violet-500 disabled:opacity-30"
          >
            {playing ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" />
            )}
          </button>
          <TransportIconButton
            disabled={disabled}
            title="Next frame"
            onClick={() => onFrameStep(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </TransportIconButton>
          <TransportIconButton
            disabled={disabled}
            title="Go to end (End)"
            onClick={() => {
              onStop();
              onSeek(maxFrame);
            }}
          >
            <SkipForward className="h-4 w-4" />
          </TransportIconButton>
        </div>

        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTimelineDurationSeconds(totalFrames, fps)}
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={maxFrame}
        value={Math.min(currentFrame, maxFrame)}
        disabled={disabled}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full accent-violet-500 disabled:opacity-40"
        style={{
          background: `linear-gradient(to right, rgb(124 58 237) 0%, rgb(124 58 237) ${scrubPct}%, rgb(38 38 38) ${scrubPct}%, rgb(38 38 38) 100%)`,
        }}
      />
    </div>
  );
}

function TransportIconButton({
  children,
  disabled,
  title,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-20"
    >
      {children}
    </button>
  );
}
