export type AnchorReframeIntensity =
  | "subtle"
  | "moderate"
  | "extreme"
  | "scene"
  | "character_lock";

export type IpAdapterProfileSettings = {
  weight: number;
  endAt: number;
  preset: string;
  weightType: "linear" | "style transfer";
};

export const IP_ADAPTER_REFRAME_PROFILES: Record<
  AnchorReframeIntensity,
  IpAdapterProfileSettings
> = {
  subtle: {
    weight: 0.45,
    endAt: 0.62,
    preset: "PLUS (high strength)",
    weightType: "linear",
  },
  moderate: {
    weight: 0.38,
    endAt: 0.5,
    preset: "PLUS (high strength)",
    weightType: "style transfer",
  },
  extreme: {
    weight: 0.32,
    endAt: 0.45,
    preset: "PLUS (high strength)",
    weightType: "style transfer",
  },
  scene: {
    weight: 0.22,
    endAt: 0.35,
    preset: "PLUS (high strength)",
    weightType: "style transfer",
  },
  character_lock: {
    weight: 0.62,
    endAt: 0.82,
    preset: "PLUS (high strength)",
    weightType: "linear",
  },
};

export function getIpAdapterProfile(
  intensity: AnchorReframeIntensity
): IpAdapterProfileSettings {
  return IP_ADAPTER_REFRAME_PROFILES[intensity];
}

/**
 * Location closer angles need architecture lock. The shared reframe table uses
 * style transfer for moderate/extreme so character sheets can change pose; that
 * same table made location close-ups keep candle mood but invent a new room.
 * Linear weight keeps walls, furniture, and doorway layout from the establishing
 * plate while the angle prompt moves the camera.
 */
export const LOCATION_IP_ADAPTER_REFRAME_PROFILES: Record<
  AnchorReframeIntensity,
  IpAdapterProfileSettings
> = {
  subtle: {
    weight: 0.55,
    endAt: 0.72,
    preset: "PLUS (high strength)",
    weightType: "linear",
  },
  moderate: {
    weight: 0.5,
    endAt: 0.65,
    preset: "PLUS (high strength)",
    weightType: "linear",
  },
  extreme: {
    weight: 0.42,
    endAt: 0.55,
    preset: "PLUS (high strength)",
    weightType: "linear",
  },
  scene: {
    weight: 0.32,
    endAt: 0.45,
    preset: "PLUS (high strength)",
    weightType: "style transfer",
  },
  character_lock: IP_ADAPTER_REFRAME_PROFILES.character_lock,
};

export function getLocationIpAdapterProfile(
  intensity: AnchorReframeIntensity
): IpAdapterProfileSettings {
  return LOCATION_IP_ADAPTER_REFRAME_PROFILES[intensity];
}

/** Defaults for tight backdrop reframes (good starting point for manual tuning). */
export const BACKDROP_TIGHT_IP_ADAPTER_DEFAULTS: IpAdapterProfileSettings = {
  weight: 0.28,
  endAt: 0.38,
  preset: "PLUS (high strength)",
  weightType: "style transfer",
};

/**
 * Dual storyboard chain: location first, character last. Location used to
 * share the weak virtual-backdrop profile (0.28 style transfer) while
 * character used a linear lock, so a studio sheet background wiped the set.
 * Linear location keeps set layout; style-transfer character keeps likeness
 * without copying the sheet pose and empty ground.
 */
export const DUAL_IP_ADAPTER_LOCATION_PROFILE: IpAdapterProfileSettings = {
  weight: 0.5,
  endAt: 0.68,
  preset: "PLUS (high strength)",
  weightType: "linear",
};

export const DUAL_IP_ADAPTER_CHARACTER_LOOK_PROFILE: IpAdapterProfileSettings = {
  weight: 0.55,
  endAt: 0.55,
  preset: "PLUS (high strength)",
  weightType: "style transfer",
};

/** Shared by location-plate / composite fallbacks (single character node). */
export const DUAL_IP_ADAPTER_CHARACTER_PROFILE: IpAdapterProfileSettings =
  IP_ADAPTER_REFRAME_PROFILES.character_lock;

/**
 * Integrate in scene: linear IP so the character body actually forms inside
 * the subject mask. Style transfer was only tinting the plate, which looked
 * like a bare location still. Harmonization still runs after the first paint.
 */
export const INTEGRATE_IN_SCENE_CHARACTER_PROFILE: IpAdapterProfileSettings = {
  weight: 0.78,
  endAt: 0.85,
  preset: "PLUS (high strength)",
  weightType: "linear",
};

/** Virtual backdrop dual chain: character first, location last so gray wins over sheet bg. */
export const DUAL_IP_ADAPTER_VIRTUAL_BACKDROP_CHARACTER_PROFILE: IpAdapterProfileSettings =
  {
    weight: 0.48,
    endAt: 0.58,
    preset: "PLUS (high strength)",
    weightType: "linear",
  };

export const DUAL_IP_ADAPTER_VIRTUAL_BACKDROP_LOCATION_PROFILE: IpAdapterProfileSettings =
  {
    weight: 0.55,
    endAt: 0.72,
    preset: "PLUS (high strength)",
    weightType: "linear",
  };

/**
 * Per-shot character likeness presets.
 * Character-only can lock harder. Integrate High is a real bump over Balanced
 * but stays below the range that turns sheets into anatomical mush.
 */
export const CHARACTER_ONLY_IDENTITY_STRENGTH_PRESETS: Record<
  "low" | "balanced" | "high",
  { weight: number; endAt: number }
> = {
  low: { weight: 0.5, endAt: 0.65 },
  balanced: { weight: 0.65, endAt: 0.8 },
  high: { weight: 0.82, endAt: 0.92 },
};

export const INTEGRATE_IDENTITY_STRENGTH_PRESETS: Record<
  "low" | "balanced" | "high",
  { weight: number; endAt: number }
> = {
  low: { weight: 0.55, endAt: 0.7 },
  balanced: { weight: 0.78, endAt: 0.85 },
  high: { weight: 0.88, endAt: 0.92 },
};

/** @deprecated Prefer mode-specific tables via resolveShotIdentityStrengthPreset. */
export const SHOT_IDENTITY_STRENGTH_PRESETS: Record<
  "low" | "balanced" | "high",
  { weight: number; endAt: number }
> = CHARACTER_ONLY_IDENTITY_STRENGTH_PRESETS;

export function resolveShotIdentityStrengthPreset(
  strength: "low" | "balanced" | "high",
  mode: string
): { weight: number; endAt: number } {
  if (mode === "integrate_in_scene") {
    return INTEGRATE_IDENTITY_STRENGTH_PRESETS[strength];
  }
  return CHARACTER_ONLY_IDENTITY_STRENGTH_PRESETS[strength];
}
