export interface DeleteProjectResponse {
  ok?: boolean;
  error?: string;
  deleteMedia?: boolean;
  keptMediaPath?: string;
  mediaDeleted?: boolean;
}

export async function deleteProjectRequest(
  projectId: string,
  deleteMedia: boolean
): Promise<{ ok: true; data: DeleteProjectResponse } | { ok: false; error: string }> {
  const query = deleteMedia ? "" : "?deleteMedia=false";
  const res = await fetch(`/api/projects/${projectId}${query}`, {
    method: "DELETE",
  });
  const data = (await res.json().catch(() => ({}))) as DeleteProjectResponse;
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : "Delete failed",
    };
  }
  return { ok: true, data };
}
