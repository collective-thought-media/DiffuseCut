import { mergeNegativePrompts } from "@/lib/services/visual-style";

export function mergeImageNegativePrompt(
  baseNegative: string,
  ...extras: Array<string | null | undefined>
): string {
  return mergeNegativePrompts(baseNegative, ...extras);
}
