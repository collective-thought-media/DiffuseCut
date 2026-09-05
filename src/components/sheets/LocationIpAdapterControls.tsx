"use client";

import { useMemo } from "react";
import { detectVirtualBackdropLocation } from "@/lib/location-backdrop";
import {
  resolveCharacterAnchorReframeIntensity,
  resolveLocationAnchorReframeIntensity,
  extractAnchoredViewDescription,
  detectCharacterRearView,
} from "@/lib/anchor-reframe";
import {
  BACKDROP_TIGHT_IP_ADAPTER_DEFAULTS,
  getIpAdapterProfile,
} from "@/lib/ip-adapter-profiles";
import { Label, Select } from "@/components/ui/button";

export type LocationIpAdapterMode = "auto" | "custom" | "prompt_only";

export type LocationIpAdapterSettings = {
  mode: LocationIpAdapterMode;
  weight: number;
  endAt: number;
};

export function defaultLocationIpAdapterSettings(
  referenceDescription: string,
  locationName: string
): LocationIpAdapterSettings {
  const backdrop = detectVirtualBackdropLocation(
    locationName,
    referenceDescription
  );
  if (backdrop) {
    return {
      mode: "custom",
      weight: BACKDROP_TIGHT_IP_ADAPTER_DEFAULTS.weight,
      endAt: BACKDROP_TIGHT_IP_ADAPTER_DEFAULTS.endAt,
    };
  }
  const intensity = resolveLocationAnchorReframeIntensity(referenceDescription);
  const profile = getIpAdapterProfile(intensity);
  return {
    mode: "auto",
    weight: profile.weight,
    endAt: profile.endAt,
  };
}

export function defaultCharacterIpAdapterSettings(
  referenceDescription: string,
  viewDescription?: string
): LocationIpAdapterSettings {
  const viewDesc =
    viewDescription?.trim() ||
    extractAnchoredViewDescription(referenceDescription);
  if (detectCharacterRearView(viewDesc)) {
    return {
      mode: "prompt_only",
      weight: 0.22,
      endAt: 0.35,
    };
  }
  const intensity = resolveCharacterAnchorReframeIntensity(
    viewDescription?.trim()
      ? `${viewDescription.trim()}. ${referenceDescription}`
      : referenceDescription
  );
  const profile = getIpAdapterProfile(intensity);
  return {
    mode: "auto",
    weight: profile.weight,
    endAt: profile.endAt,
  };
}

interface LocationIpAdapterControlsProps {
  referenceDescription: string;
  locationName: string;
  settings: LocationIpAdapterSettings;
  onChange: (settings: LocationIpAdapterSettings) => void;
  disabled?: boolean;
  entityKind?: "location" | "character";
  viewDescription?: string;
}

export function LocationIpAdapterControls({
  referenceDescription,
  locationName,
  settings,
  onChange,
  disabled = false,
  entityKind = "location",
  viewDescription,
}: LocationIpAdapterControlsProps) {
  const autoProfile = useMemo(
    () =>
      entityKind === "character"
        ? defaultCharacterIpAdapterSettings(
            referenceDescription,
            viewDescription
          )
        : defaultLocationIpAdapterSettings(referenceDescription, locationName),
    [entityKind, referenceDescription, locationName, viewDescription]
  );
  const rearViewAuto =
    entityKind === "character" &&
    detectCharacterRearView(viewDescription?.trim() ?? referenceDescription);

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Anchor reference</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tune how much this batch follows your saved anchor image vs the text
          prompt. Lower influence gives the prompt more control (useful for
          tighter crops). Prompt only ignores the anchor entirely.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ip-adapter-mode">Generation mode</Label>
        <Select
          id="ip-adapter-mode"
          value={settings.mode}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...settings,
              mode: e.target.value as LocationIpAdapterMode,
            })
          }
        >
          <option value="auto">
            Auto (app picks influence from angle description)
          </option>
          <option value="custom">Custom IP-Adapter influence</option>
          <option value="prompt_only">Prompt only (ignore anchor image)</option>
        </Select>
      </div>

      {settings.mode === "auto" && (
        <p className="text-xs text-muted-foreground">
          {rearViewAuto ? (
            <>
              Back and rear views default to Prompt only. The front anchor
              image causes front-facing double portraits when IP-Adapter is on.
            </>
          ) : (
            <>
              Auto for this angle: weight {autoProfile.weight.toFixed(2)}, through
              step {(autoProfile.endAt * 100).toFixed(0)}% of denoising.
            </>
          )}
        </p>
      )}

      {settings.mode === "prompt_only" && rearViewAuto && (
        <p className="text-xs text-muted-foreground">
          Generating from your text prompt only. Wardrobe and hair should match
          your descriptions. Pick the best back shot, then save it as this
          angle&apos;s reference.
        </p>
      )}

      {settings.mode === "custom" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ip-adapter-weight">
              Anchor influence ({settings.weight.toFixed(2)})
            </Label>
            <input
              id="ip-adapter-weight"
              type="range"
              min={0.1}
              max={0.65}
              step={0.01}
              value={settings.weight}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...settings,
                  weight: Number(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              Lower = prompt drives framing. Higher = closer match to anchor
              color and tone.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ip-adapter-end">
              Apply through ({(settings.endAt * 100).toFixed(0)}% of steps)
            </Label>
            <input
              id="ip-adapter-end"
              type="range"
              min={0.2}
              max={0.75}
              step={0.01}
              value={settings.endAt}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...settings,
                  endAt: Number(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              How long IP-Adapter stays active during generation. Shorter often
              helps tight reframes stop copying anchor composition.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function locationIpAdapterSettingsToApi(
  settings: LocationIpAdapterSettings
): {
  useIpAdapter?: boolean;
  ipAdapterWeight?: number;
  ipAdapterEndAt?: number;
} {
  if (settings.mode === "prompt_only") {
    return { useIpAdapter: false };
  }
  if (settings.mode === "custom") {
    return {
      useIpAdapter: true,
      ipAdapterWeight: settings.weight,
      ipAdapterEndAt: settings.endAt,
    };
  }
  return { useIpAdapter: true };
}
