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

/** Defaults for tight backdrop reframes (good starting point for manual tuning). */
export const BACKDROP_TIGHT_IP_ADAPTER_DEFAULTS: IpAdapterProfileSettings = {
  weight: 0.28,
  endAt: 0.38,
  preset: "PLUS (high strength)",
  weightType: "style transfer",
};

/** Fixed dual IP-Adapter tuning: background first, character last in the chain. */
export const DUAL_IP_ADAPTER_LOCATION_PROFILE: IpAdapterProfileSettings =
  BACKDROP_TIGHT_IP_ADAPTER_DEFAULTS;

export const DUAL_IP_ADAPTER_CHARACTER_PROFILE: IpAdapterProfileSettings =
  IP_ADAPTER_REFRAME_PROFILES.character_lock;

/**
 * Integrate in scene: keep character identity, outfit, and look but drop the
 * reference image's pose and composition. Linear weight transfers composition,
 * so a crouching or seated casting reference forces that pose into every shot;
 * style transfer carries appearance without the pose. Style transfer operates
 * at higher weights than linear.
 */
export const INTEGRATE_IN_SCENE_CHARACTER_PROFILE: IpAdapterProfileSettings = {
  weight: 0.6,
  endAt: 0.55,
  preset: "PLUS (high strength)",
  weightType: "style transfer",
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
 * Per-shot character likeness presets for storyboard stills.
 * "balanced" matches DUAL_IP_ADAPTER_CHARACTER_PROFILE (the default), so it
 * is expressed by leaving the plan's IP-Adapter overrides unset.
 */
export const SHOT_IDENTITY_STRENGTH_PRESETS: Record<
  "low" | "balanced" | "high",
  { weight: number; endAt: number }
> = {
  low: { weight: 0.45, endAt: 0.7 },
  balanced: { weight: 0.62, endAt: 0.82 },
  high: { weight: 0.75, endAt: 0.9 },
};
