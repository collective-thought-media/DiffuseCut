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

/** Back, rear, or facing-away poses opposite a typical front anchor. */
export function detectCharacterRearView(description: string): boolean {
  const lower = description.toLowerCase();
  return /back of (the |their )?(head|neck)|from behind|rear view|back view|turned away|facing away|back to camera|back turned|behind the (subject|character)|only see the back|face not visible|no face visible|not facing camera|back of head|shoulders to camera|camera behind|subject turned away|facing away from camera|full body back|back full body|from the back|view from behind|nape exposed|between the shoulder blades|lower back tattoo|tramp stamp|skull patch.*shoulder blades|heels on the ground.*boots|wallet chain.*belt loop/.test(
    lower
  );
}

/** IP-Adapter reframe strength for anchored character angles. */
export function resolveCharacterAnchorReframeIntensity(
  anchoredDescription: string
): AnchorReframeIntensity {
  const viewDesc = extractAnchoredViewDescription(anchoredDescription);
  if (detectCharacterRearView(viewDesc)) {
    return "scene";
  }
  const lower = viewDesc.toLowerCase();
  if (
    /profile|side view|90 degree|from the side|left profile|right profile|three-quarter from behind/.test(
      lower
    )
  ) {
    return "extreme";
  }
  return resolveAnchorReframeIntensity(viewDesc);
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
