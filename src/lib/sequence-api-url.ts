export function withSequenceId(
  url: string,
  sequenceId: string | null | undefined
): string {
  if (!sequenceId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}sequenceId=${encodeURIComponent(sequenceId)}`;
}
