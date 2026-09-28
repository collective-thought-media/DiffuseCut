/**
 * Locked ACE-Step recipe for DiffuseCut film scores.
 * Proven by Control Gate + Sand Storm D-controlgate takes (empty lyrics,
 * temperature 0, generate longer then trim).
 *
 * Do not "improve" these without a direct A/B against Comfy turbo AIO.
 */

export const ACE_STEP_CONTROL_GATE = {
  checkpoint: "ace_step_1.5_turbo_aio.safetensors",
  /** Turbo AIO is distilled for 8 steps. */
  steps: 8,
  samplerName: "euler" as const,
  scheduler: "simple" as const,
  samplerCfg: 1.0,
  modelShift: 3.0,
  /** TextEncodeAceStepAudio1.5 */
  cfgScale: 1.0,
  temperature: 0.0,
  topP: 1.0,
  topK: 0,
  minP: 0.0,
  generateAudioCodes: true,
  timesignature: "4",
  language: "en",
  /** Instrumental scores: lyrics must stay empty. */
  lyrics: "",
  /**
   * Short edit spans are unstable. Generate at least this many seconds, then
   * ffmpeg-trim to the track length in audio-score-generation.
   */
  minMusicSourceSeconds: 45,
  maxMusicSourceSeconds: 180,
} as const;

/**
 * Locked instrumental / energy pack. Matches the D-controlgate Comfy job that
 * produced audible cinematic scores. Sampler settings alone are not enough;
 * DiffuseCut must send this body instead of a freeform user essay as tags.
 */
export const ACE_STEP_CONTROL_GATE_MUSIC_BODY =
  "orchestral string ensemble, low cello pad, legato violins, rising tension, slow burn, emotional underscore, dynamic crescendo building through the cue, brass and timpani for the climax, high strings intensify toward the finish, fortissimo peak at the end, resolve at the end, instrumental only, no vocals, no singing, no lyrics, continuous energy throughout, hi-fi, wide stereo";

/**
 * Exact tags from the proven Sand Storm D-controlgate take
 * (D-controlgate-45s-1790022107950.mp3 / cg_desert on Comfy).
 * Prefer ACE_STEP_PROVEN_MEDALLION_CRESCENDO_TAGS for end-of-act rises.
 */
export const ACE_STEP_PROVEN_DESERT_SCORE_TAGS =
  "cinematic desert film score, orchestral string ensemble, low cello pad, " +
  "legato violins, rising tension, slow burn, emotional underscore, " +
  "warm amber atmosphere, sand and wind texture soft under strings, " +
  "dynamic crescendo mid cue, resolve at the end, instrumental only, no vocals, " +
  "no singing, no lyrics, continuous energy throughout, hi-fi, wide stereo, 72 bpm";

/** Medallion / act-out: continuous energy, climax in final ~7s. Pair with trimFrom end. */
export const ACE_STEP_PROVEN_MEDALLION_CRESCENDO_TAGS =
  "cinematic desert film score, epic symphonic underscore, orchestral string ensemble, " +
  "low cello pad, legato violins, rising tension, slow burn, emotional underscore, " +
  "warm amber atmosphere, sand and wind texture soft under strings, " +
  "steady driving pulse through most of the cue, continuous energy throughout, " +
  "then in the final seven seconds accelerando and fortissimo crescendo, " +
  "tempo pushes faster, brass and timpani enter, high strings intensify, " +
  "new rhythmic urgency and thicker orchestration only at the climax, " +
  "heroic medallion reveal peak at the very end, resolve at the end, " +
  "instrumental only, no vocals, no singing, no lyrics, hi-fi, wide stereo, 72 bpm";

/** @deprecated Prefer ACE_STEP_CONTROL_GATE_MUSIC_BODY; kept for tests/callers. */
export const ACE_STEP_CINEMATIC_TAG_BOOSTS = [
  "cinematic orchestral score",
  "orchestral string ensemble",
  "legato violins",
  "low cello pad",
  "rising tension",
  "slow burn",
  "dynamic crescendo",
  "emotional underscore",
  "resolve at the end",
  "instrumental only",
  "no vocals",
  "no singing",
  "no lyrics",
  "continuous energy throughout",
  "hi-fi",
  "wide stereo",
] as const;
