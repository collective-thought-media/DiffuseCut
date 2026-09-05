import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DependencyMissingError } from "@/types";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400, extra?: object) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof HttpError) {
    return jsonError(err.message, err.status, err.extra);
  }
  if (err instanceof DependencyMissingError) {
    return jsonError(err.message, 503, {
      dependencyId: err.dependencyId,
      installHint: err.installHint,
    });
  }
  if (err instanceof Error && "code" in err && err.code === "BINDING_NODE_MISMATCH") {
    return jsonError(err.message, 422, { code: "BINDING_NODE_MISMATCH" });
  }
  console.error(err);
  return jsonError(
    err instanceof Error ? err.message : "Internal server error",
    500
  );
}

export async function parseJson<T>(req: NextRequest): Promise<T> {
  return req.json() as Promise<T>;
}
