export function mediaUrl(
  projectId: string,
  relativePath: string,
  options?: { version?: number | string | null }
): string {
  const normalized = relativePath.replace(/^\/+/, "");
  const base = `/api/media/${projectId}/${normalized}`;
  if (options?.version != null && options.version !== "") {
    return `${base}?v=${encodeURIComponent(String(options.version))}`;
  }
  return base;
}
