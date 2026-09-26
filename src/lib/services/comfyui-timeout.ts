/** Max wait for ComfyUI HTTP calls (LAN GPUs can be slow to respond). */
export function comfyuiHttpTimeoutMs(): number {
  const raw = process.env.DIFFUSECUT_COMFYUI_TIMEOUT_MS;
  if (raw?.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1000) {
      return parsed;
    }
  }
  return 15_000;
}

export async function fetchWithComfyuiTimeout(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = comfyuiHttpTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
