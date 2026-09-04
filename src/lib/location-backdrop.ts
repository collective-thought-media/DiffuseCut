/**
 * Client-safe backdrop detection (no server/db imports).
 * Virtual backdrop / cyclorama locations where the "set" is only a seamless surface.
 */
export function detectVirtualBackdropLocation(
  ...parts: (string | undefined | null)[]
): boolean {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (!text.trim()) return false;

  // "Background plate" is normal film language for any reference still, including exteriors.
  const strongStudioSignals = [
    /\bseamless\b/,
    /\bcyclorama\b/,
    /\bcyc[\s-]?(wall|stage|studio)\b/,
    /\b(gray|grey|white|neutral|beige|tan|charcoal|black)\s+(backdrop|background)\b/,
    /\bbackdrop\s+(paper|roll|seamless|only|fills)\b/,
    /\bbackdrop\b.*\b(gray|grey|white|neutral|paper|seamless|muslin)\b/,
    /\b(gray|grey|white|neutral)\s+seamless\b/,
    /\bstudio\s+(gray|grey|white|neutral)\b/,
    /\b(virtual|empty)\s+(backdrop|background)\b/,
    /\bmuslin\s+backdrop\b/,
    /\bpaper\s+backdrop\b/,
    /\bin[- ]camera\s+(backdrop|background)\b/,
    /\bbackdrop\s+fills\b/,
    /\bfills\s+the\s+(entire\s+)?frame\b.*\b(backdrop|seamless|gray|grey)\b/,
    /\bneutral\s+(gray|grey)\s+seamless\b/,
  ];

  if (strongStudioSignals.some((pattern) => pattern.test(text))) {
    return true;
  }

  // Weaker "background" hints only count when nothing reads like a real location.
  const weakBackgroundHints =
    /\bbackground\s+(fills|fill)\b/.test(text) ||
    /\bbackground\s+plate\b.*\b(gray|grey|white|neutral|seamless|backdrop|studio)\b/.test(
      text
    );

  if (!weakBackgroundHints) {
    return false;
  }

  const physicalEnvironment =
    /\b(street|sidewalk|storefront|deli|facade|building|park|forest|interior|city|urban|road|avenue|block|neighborhood|awning|curb|path|trees?|store|restaurant|exterior|sidewalk|manhattan|block)\b/.test(
      text
    );

  return !physicalEnvironment;
}
