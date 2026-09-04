"use client";

import { Button } from "@/components/ui/button";
import { formatFrameLabel } from "@/lib/timing/frames";

interface TransportControlsProps {
  playing: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (frame: number) => void;
}

export function TransportControls({
  playing,
  currentFrame,
  totalFrames,
  fps,
  onPlayPause,
  onStop,
  onSeek,
}: TransportControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <Button size="sm" variant="secondary" onClick={onPlayPause}>
        {playing ? "Pause" : "Play"}
      </Button>
      <Button size="sm" variant="outline" onClick={onStop}>
        Stop
      </Button>
      <div className="flex flex-1 items-center gap-2 min-w-[200px]">
        <input
          type="range"
          min={0}
          max={Math.max(totalFrames - 1, 0)}
          value={currentFrame}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-primary"
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {currentFrame} / {totalFrames} · {formatFrameLabel(currentFrame, fps)}
      </span>
    </div>
  );
}
