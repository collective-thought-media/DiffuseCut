/**
 * Move "no redhead / no human face" style phrases out of positives.
 * In diffusion, naming a forbidden concept in the positive still activates it.
 */

const POSITIVE_NEGATION_RE =
  /\b(?:no|not an?|without)\s+([a-z][\w\s-]{0,48}?)(?=,|\.|$|;|:)/gi;

export function splitPositiveNegationPhrases(text: string): {
  cleaned: string;
  negativeTerms: string[];
} {
  const negativeTerms: string[] = [];
  if (!text.trim()) return { cleaned: text, negativeTerms };

  const cleaned = text
    .replace(POSITIVE_NEGATION_RE, (_full, term: string) => {
      const normalized = String(term)
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.]+$/g, "");
      if (normalized.length >= 2) {
        negativeTerms.push(normalized);
      }
      return "";
    })
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ",")
    .replace(/\.\s*\.+/g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();

  return { cleaned, negativeTerms };
}

export function mergeUniqueNegativeTerms(
  negativePrompt: string,
  terms: string[]
): string {
  if (terms.length === 0) return negativePrompt;
  const existing = new Set(
    negativePrompt
      .split(/,\s*/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
  const additions = terms.filter(
    (term) => term.trim() && !existing.has(term.trim().toLowerCase())
  );
  if (additions.length === 0) return negativePrompt;
  return negativePrompt.trim()
    ? `${negativePrompt.trim()}, ${additions.join(", ")}`
    : additions.join(", ");
}
