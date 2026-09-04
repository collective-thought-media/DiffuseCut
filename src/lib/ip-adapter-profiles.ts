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
