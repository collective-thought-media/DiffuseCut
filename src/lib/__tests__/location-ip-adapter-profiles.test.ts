import { describe, expect, it } from "vitest";
import { resolveLocationAnchorReframeIntensity } from "@/lib/anchor-reframe";
import {
  getIpAdapterProfile,
  getLocationIpAdapterProfile,
} from "@/lib/ip-adapter-profiles";
import { defaultLocationIpAdapterSettings } from "@/components/sheets/LocationIpAdapterControls";

describe("location IP-Adapter reframe profiles", () => {
  it("keeps a linear set lock for close-up location angles", () => {
    const intensity = resolveLocationAnchorReframeIntensity(
      "Close up of the candle table in the same dragon lair"
    );
    expect(intensity).toBe("moderate");
    const shared = getIpAdapterProfile(intensity);
    const location = getLocationIpAdapterProfile(intensity);
    expect(shared.weightType).toBe("style transfer");
    expect(location.weightType).toBe("linear");
    expect(location.weight).toBeGreaterThan(shared.weight);
  });

  it("defaults location Auto mode to the stronger location profile", () => {
    const settings = defaultLocationIpAdapterSettings(
      "Close up of the candle table in the same dragon lair",
      "Dragon Lair"
    );
    expect(settings.mode).toBe("auto");
    expect(settings.weight).toBe(0.5);
    expect(settings.endAt).toBe(0.65);
  });
});
