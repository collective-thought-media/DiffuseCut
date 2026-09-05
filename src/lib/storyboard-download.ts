export async function downloadStoryboardPacket(
  projectId: string,
  shotId?: string
): Promise<void> {
  const query = shotId ? `?shotId=${encodeURIComponent(shotId)}` : "";
  const res = await fetch(
    `/api/projects/${projectId}/storyboard/export${query}`
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(data?.error ?? "Could not export storyboard");
  }

  const blob = await res.blob();
  const header = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(header);
  const fileName = match?.[1] ?? "storyboard.zip";
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
