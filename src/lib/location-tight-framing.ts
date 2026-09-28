/**
 * Client-safe location framing helpers (no server/db imports).
 */

const SURFACE_MACRO_VIEW =
  /\b(marco|macro|extreme close|surface detail|texture fill|millimeter|millimetre|inches from the surface|microscopic)\b/i;

const OBJECT_CLOSE_VIEW =
  /\b(close-up|close up|close shot|medium close|hero close|85\s*mm|100\s*mm|105\s*mm|telephoto|few feet|two feet|2 feet|four feet|4 feet|arm'?s length|looking (straight )?at|standing in front of|walk(?:s|ing)? (?:past|up|over))\b/i;

export type LocationTightFraming = "surface_macro" | "object_close";

export function resolveLocationTightFraming(
  ...parts: Array<string | undefined>
): LocationTightFraming | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;
  if (SURFACE_MACRO_VIEW.test(text)) return "surface_macro";
  if (OBJECT_CLOSE_VIEW.test(text)) return "object_close";
  return null;
}

/** True for any tight angle that must not use the wide environment layout suffix. */
export function locationViewIsDetailCloseup(
  ...parts: Array<string | undefined>
): boolean {
  return resolveLocationTightFraming(...parts) != null;
}
