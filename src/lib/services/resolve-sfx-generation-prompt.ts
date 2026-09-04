import type { AudioTrack, Shot } from "@/lib/db/schema";
import {
  buildSfxPromptFromShot,
  buildWooshBedPromptFromShot,
  buildWooshPromptFromShot,
  LIGHTNING_STRIKE_WOOSH_PROMPT,
  shotNeedsLightningStrikeLayer,
} from "@/lib/services/shot-sfx-suggest";

export interface ResolvedSfxGenerationPrompt {
  /** Stored on the track and shown in the UI. */
  brief: string;
  /** Full model brief when no strike layer is used. */
  modelPrompt: string;
  /** Short impulsive layer (lightning crack), mixed at the start. */
  strikeModelPrompt: string | null;
  /** Longer ambience under the strike. */
  bedModelPrompt: string | null;
  /** True when cues were derived from the linked storyboard shot. */
  fromShot: boolean;
}

export function resolveSfxGenerationPrompt(options: {
  track: AudioTrack;
  shots: Shot[];
}): ResolvedSfxGenerationPrompt {
  const { track, shots } = options;
  const shotIndex = shots.findIndex((row) => row.id === track.targetShotId);
  const shot = shotIndex >= 0 ? shots[shotIndex] : undefined;

  if (shot) {
    const source = `${shot.title} ${shot.prompt}`.trim();
    const brief = buildSfxPromptFromShot(shot, shotIndex);
    const useStrike = shotNeedsLightningStrikeLayer(source);

    return {
      brief,
      modelPrompt: buildWooshPromptFromShot(shot, shotIndex),
      strikeModelPrompt: useStrike ? LIGHTNING_STRIKE_WOOSH_PROMPT : null,
      bedModelPrompt: useStrike ? buildWooshBedPromptFromShot(shot, shotIndex) : null,
      fromShot: true,
    };
  }

  const brief = track.promptText?.trim() ?? "";
  if (!brief) {
    throw new Error(`SFX track "${track.label}" has no prompt and no linked shot.`);
  }

  const useStrike = shotNeedsLightningStrikeLayer(brief);

  return {
    brief,
    modelPrompt: brief,
    strikeModelPrompt: useStrike ? LIGHTNING_STRIKE_WOOSH_PROMPT : null,
    bedModelPrompt: null,
    fromShot: false,
  };
}
