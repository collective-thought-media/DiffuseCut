import { detectVirtualBackdropLocation } from "@/lib/location-backdrop";
import type { AnchorReframeIntensity } from "@/lib/ip-adapter-profiles";

/** First segment of an anchored reference description (the angle view line). */
export function extractAnchoredViewDescription(
  anchoredDescription: string
): string {
  const trimmed = anchoredDescription.trim();
  if (!trimmed) return "";
  return trimmed.split(/\.\s+/)[0]?.trim() ?? trimmed;
}

/** How aggressively the angle description diverges from the anchor reference. */
export function resolveAnchorReframeIntensity(
  description: string
): AnchorReframeIntensity {
  const lower = description.toLowerCase();
  if (
    /extreme macro|macro close|macro shot|extreme close|close-up detail|tight macro|surface detail|texture fill|fills the frame|subject fills/.test(
      lower
    )
  ) {
    return "extreme";
  }
  if (
    /macro|close-up|close up|tight shot|85mm|telephoto|low angle|overhead|push.?in|medium shot|detail shot|ground level|looking straight at|zoomed in|head and shoulders|head-and-shoulders|chest-up|chest up|bust framing|portrait zone|85 mm|100mm|105mm/.test(
      lower
    )
  ) {
    return "moderate";
  }
  return "subtle";
}

/** IP-Adapter reframe strength for anchored location angles. */
export function resolveLocationAnchorReframeIntensity(
  anchoredDescription: string
): AnchorReframeIntensity {
  const viewDesc = extractAnchoredViewDescription(anchoredDescription);
  const intensity = resolveAnchorReframeIntensity(viewDesc);
  if (!detectVirtualBackdropLocation(anchoredDescription)) {
    return intensity;
  }
  const lower = viewDesc.toLowerCase();
  if (
    /head and shoulders|head-and-shoulders|chest-up|chest up|bust framing|portrait zone|85mm|100mm|105mm|tight crop|tighter crop/.test(
      lower
    )
  ) {
    return "extreme";
  }
  if (intensity === "moderate") {
    return "extreme";
  }
  return intensity;
}
