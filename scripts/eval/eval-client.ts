const DEFAULT_BASE = process.env.EVAL_BASE_URL ?? "http://localhost:3004";

export class EvalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "EvalApiError";
  }
}

export class EvalClient {
  constructor(readonly baseUrl: string = DEFAULT_BASE) {}

  async request<T>(
    method: string,
    pathname: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${pathname}`;
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const message =
        typeof parsed === "object" &&
        parsed !== null &&
        "error" in parsed &&
        typeof (parsed as { error: unknown }).error === "string"
          ? (parsed as { error: string }).error
          : `HTTP ${res.status} ${method} ${pathname}`;
      throw new EvalApiError(message, res.status, parsed);
    }

    return parsed as T;
  }

  get<T>(pathname: string) {
    return this.request<T>("GET", pathname);
  }

  post<T>(pathname: string, body?: unknown) {
    return this.request<T>("POST", pathname, body);
  }

  patch<T>(pathname: string, body: unknown) {
    return this.request<T>("PATCH", pathname, body);
  }

  put<T>(pathname: string, body: unknown) {
    return this.request<T>("PUT", pathname, body);
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BatchOptionView {
  id: string;
  status: string;
  outputPath?: string | null;
  errorMessage?: string | null;
  pipelineStage?: string | null;
}

export interface BatchView {
  batch?: { id: string; status: string } | null;
  packs?: Array<{
    options?: BatchOptionView[];
  }>;
  options?: BatchOptionView[];
}

export function flattenBatchOptions(view: BatchView): BatchOptionView[] {
  if (view.options?.length) return view.options;
  const fromPacks =
    view.packs?.flatMap((pack) => pack.options ?? []) ?? [];
  return fromPacks;
}

export function pickCompletedOption(
  options: BatchOptionView[]
): BatchOptionView | null {
  return (
    options.find((o) => o.status === "completed" && o.outputPath) ?? null
  );
}

export async function waitForAssetBatch(
  client: EvalClient,
  pollPath: string,
  batchId: string,
  timeoutMs = 900_000
): Promise<BatchView> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const view = await client.get<BatchView>(
      `${pollPath}?batchId=${encodeURIComponent(batchId)}`
    );
    const status = view.batch?.status;
    if (
      status === "awaiting_selection" ||
      status === "completed" ||
      status === "failed"
    ) {
      return view;
    }
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for batch ${batchId}`);
}

export interface RenderJobView {
  id: string;
  shotId: string;
  status: string;
  progress?: number;
  errorMessage?: string | null;
  outputPath?: string | null;
}

export async function waitForRenderJobs(
  client: EvalClient,
  projectId: string,
  jobIds: string[],
  timeoutMs = 1_800_000
): Promise<RenderJobView[]> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { jobs } = await client.get<{ jobs: RenderJobView[] }>(
      `/api/render-jobs?projectId=${encodeURIComponent(projectId)}`
    );
    const tracked = jobs.filter((j) => jobIds.includes(j.id));
    const allDone = tracked.every(
      (j) =>
        j.status === "completed" ||
        j.status === "failed" ||
        j.status === "cancelled"
    );
    if (tracked.length === jobIds.length && allDone) {
      return tracked;
    }
    await sleep(8000);
  }
  throw new Error("Timed out waiting for render jobs");
}

export interface ExportJobView {
  id: string;
  status: string;
  progress?: number;
  outputPath?: string | null;
  errorMessage?: string | null;
}

export async function waitForExportJob(
  client: EvalClient,
  jobId: string,
  timeoutMs = 600_000
): Promise<ExportJobView> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { job } = await client.get<{ job: ExportJobView }>(
      `/api/export/${encodeURIComponent(jobId)}`
    );
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return job;
    }
    await sleep(4000);
  }
  throw new Error(`Timed out waiting for export job ${jobId}`);
}
