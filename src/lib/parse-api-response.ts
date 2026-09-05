type ApiErrorBody = { error?: string };

export async function readApiResponseBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      snippet
        ? `Server error (${res.status}): ${snippet}`
        : `Server error (${res.status}) with an empty response`
    );
  }
}

export async function parseApiResponse<T extends ApiErrorBody>(
  res: Response
): Promise<T> {
  const data = await readApiResponseBody<T>(res);
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}
