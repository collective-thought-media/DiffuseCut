import { describe, expect, it } from "vitest";
import { resolveLocationAnchorReframeIntensity } from "@/lib/anchor-reframe";
import {
  getIpAdapterProfile,
  getLocationIpAdapterProfile,
  LOCATION_SET_CONTINUITY_IP_ADAPTER_PROFILE,
  LOCATION_TIGHT_REFRAME_IP_ADAPTER_PROFILE,
} from "@/lib/ip-adapter-profiles";
import { defaultLocationIpAdapterSettings } from "@/components/sheets/LocationIpAdapterControls";

describe("location IP-Adapter reframe profiles", () => {
  it("uses style transfer for moderate location reframes", () => {
    const intensity = resolveLocationAnchorReframeIntensity(
      "Close up of the candle table in the same dragon lair"
    );
    expect(intensity).toBe("moderate");
    const shared = getIpAdapterProfile(intensity);
    const location = getLocationIpAdapterProfile(intensity);
    expect(shared.weightType).toBe("style transfer");
    expect(location.weightType).toBe("style transfer");
    expect(location.weight).toBeGreaterThan(shared.weight);
  });

  it("treats new-camera valley walk-ins as moderate reframes", () => {
    expect(
      resolveLocationAnchorReframeIntensity(
        "New camera position down inside the valley at the base of the same dune"
      )
    ).toBe("moderate");
  });

  it("uses style transfer for set continuity and tight walk-around angles", () => {
    expect(LOCATION_SET_CONTINUITY_IP_ADAPTER_PROFILE.weightType).toBe(
      "style transfer"
    );
    expect(LOCATION_SET_CONTINUITY_IP_ADAPTER_PROFILE.weight).toBeGreaterThan(
      0.55
    );
    expect(LOCATION_TIGHT_REFRAME_IP_ADAPTER_PROFILE.weightType).toBe(
      "style transfer"
    );
  });

  it("defaults close-up Auto to tight style-transfer material lock", () => {
    const settings = defaultLocationIpAdapterSettings(
      "Close up of the candle table in the same dragon lair",
      "Dragon Lair"
    );
    expect(settings.mode).toBe("auto");
    expect(settings.weight).toBe(0.58);
    expect(settings.endAt).toBe(0.66);
  });

  it("defaults valley Auto to strong set continuity lock", () => {
    const settings = defaultLocationIpAdapterSettings(
      "New camera position down inside the valley at the base of the same dune",
      "The Sand Pits"
    );
    expect(settings.mode).toBe("auto");
    expect(settings.weight).toBe(0.62);
    expect(settings.endAt).toBe(0.72);
  });
});
