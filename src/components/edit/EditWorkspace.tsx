"use client";

import { useState } from "react";
import type { AudioTrack, Sequence, Shot } from "@/lib/db/schema";
import type { TimelineState } from "@/lib/timeline/types";
import type { ShotAudioPolicy } from "@/lib/shot-render-overrides";
import { SequenceSwitcher } from "@/components/project/SequenceSwitcher";
import { FinishingTimeline } from "@/components/finishing/FinishingTimeline";
import { TimelineEditorPanel } from "@/components/edit/TimelineEditorPanel";
import type { TextOverlayDraft } from "@/components/export/OverlayEditor";

type Props = {
  projectId: string;
  shots: Shot[];
  fps: number;
  selectedShotId: string | null;
  currentFrame: number;
  playing: boolean;
  overlays: TextOverlayDraft[];
  audioTracks: AudioTrack[];
  onSelectShot: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (frame: number) => void;
  onVideoTimeUpdate: (shotIndex: number, videoTimeSec: number) => void;
  onVideoShotEnd: (shotIndex: number) => void;
  showAllTrimShots: boolean;
  onToggleShowAllTrim: () => void;
  onUpdateTrim: (
    shotId: string,
    trimInFrames: number,
    trimOutFrames: number | null
  ) => void;
  onSelectShotFromTrim: (shotId: string, frameInShot: number) => void;
  onUpdateAudioPolicy?: (shotId: string, policy: ShotAudioPolicy | "") => void;
  sequences: Sequence[];
  activeSequenceId: string | null;
  onSelectSequence: (sequenceId: string) => void;
  onSequencesChanged: () => void;
  onNlePlaybackExtentChange?: (totalFrames: number) => void;
  onTimelineFrameChange?: (frame: number) => void;
  onTimelinePlaybackEnd?: () => void;
};

export function EditWorkspace(props: Props) {
  const { projectId } = props;
  const [editTimeline, setEditTimeline] = useState<TimelineState | null>(null);
  const [editTimelineLoading, setEditTimelineLoading] = useState(true);

  return (
    <div className="space-y-4">
      <SequenceSwitcher
        projectId={projectId}
        sequences={props.sequences}
        activeSequenceId={props.activeSequenceId}
        onSelect={props.onSelectSequence}
        onChanged={props.onSequencesChanged}
      />

      {props.activeSequenceId ? (
        <>
          <FinishingTimeline
            {...props}
            editDeskLayout
            editTimeline={editTimeline}
            editTimelineLoading={editTimelineLoading}
            editSequenceId={props.activeSequenceId}
            onTimelineFrameChange={props.onTimelineFrameChange}
            onTimelinePlaybackEnd={props.onTimelinePlaybackEnd}
          />
          <TimelineEditorPanel
            projectId={projectId}
            sequenceId={props.activeSequenceId}
            shots={props.shots}
            audioTracks={props.audioTracks}
            fps={props.fps}
            currentFrame={props.currentFrame}
            playing={props.playing}
            onPlayPause={props.onPlayPause}
            onStop={props.onStop}
            onSeek={props.onSeek}
            onTimelineChange={setEditTimeline}
            onTimelineLoadingChange={setEditTimelineLoading}
            onPlaybackExtentChange={props.onNlePlaybackExtentChange}
          />
        </>
      ) : null}
    </div>
  );
}
