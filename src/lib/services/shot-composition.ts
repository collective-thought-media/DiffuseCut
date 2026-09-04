/** Shot camera/composition helpers shared by prompt building and the worker. */

export function detectRearViewShot(description: string): boolean {
  const lower = description.toLowerCase();
  return /\b(back|rear|behind|from behind|back to camera|back view|dorsal|over the shoulder|(?:demon|character|subject|his|her|their)['']?s back)\b/.test(
    lower
  );
}

export function detectWideShot(description: string): boolean {
  const lower = description.toLowerCase();
  return /\b(wide shot|wide angle|establishing shot|master shot|long shot|full scene|symmetrical shot|epic wide|vast wide)\b/.test(
    lower
  );
}

export function detectDetailMacroShot(description: string): boolean {
  if (detectWideShot(description)) {
    return false;
  }

  const lower = description.toLowerCase();
  return /\b(close-?up|close up|macro|extreme macro|tight close|tight shot|detail shot|texture fill|fills the frame|subject fills|inches from)\b/.test(
    lower
  );
}

/** Pose or staging that diverges from a neutral character-sheet stand. */
export function detectActionPoseShot(description: string): boolean {
  const lower = description.toLowerCase();
  return /\b(kneel|kneeling|bowed|head bowed|head lowered|crouch|crouching|lying|seated|sitting|prone|submission|spread entirely open|wings spread|wings open|action pose|dynamic pose|running|leaping|fallen|collapsed|prostrat)\b/.test(
    lower
  );
}

/** Multiple distinct characters staged in one frame. */
export function detectEnsembleShot(description: string): boolean {
  const lower = description.toLowerCase();
  const countHint =
    /\b(two|three|four|both|pair of|group of|several|multiple|foreground and background)\b/.test(
      lower
    ) && /\b(seraphim|characters|figures|warriors|angels|demons|soldiers)\b/.test(lower);
  const foregroundFraming = /\b(foreground|frame the shot|flank|flanking|surround)\b/.test(
    lower
  );
  return countHint || foregroundFraming;
}

/** @deprecated Reference skipping removed; IP-Adapter always runs when a reference exists. */
export function shouldSkipShotReferenceImage(_shotPrompt: string): boolean {
  return false;
}

export function shouldUseMacroDetailLatent(_shotPrompt: string): boolean {
  return false;
}

export const SHOT_MACRO_LATENT_WIDTH = 896;
export const SHOT_MACRO_LATENT_HEIGHT = 896;
