import type { Pagination } from "@/lib/api-client";
import { AppError } from "./errors";
import { currentRequestId } from "./request-context";

export type { Pagination };

interface Opts {
  message?: string;
  status?: number;
  meta?: Record<string, unknown>;
  headers?: HeadersInit;
}

function envelope(body: {
  success: boolean;
  data: unknown;
  error: unknown;
  message: string;
  pagination: Pagination | null;
  meta?: Record<string, unknown>;
}) {
  return { ...body, meta: { requestId: currentRequestId() ?? crypto.randomUUID(), ...(body.meta ?? {}) } };
}

export function ok<T>(data: T, opts: Opts = {}): Response {
  return Response.json(
    envelope({ success: true, data, error: null, message: opts.message ?? "OK", pagination: null, meta: opts.meta }),
    { status: opts.status ?? 200, headers: opts.headers },
  );
}

export function created<T>(data: T, opts: Opts = {}): Response {
  return ok(data, { message: "Creado", ...opts, status: 201 });
}

export function paginated<T>(
  items: T[],
  p: { page: number; pageSize: number; total: number },
  opts: Opts = {},
): Response {
  const pagination: Pagination = {
    page: p.page,
    pageSize: p.pageSize,
    total: p.total,
    totalPages: Math.max(1, Math.ceil(p.total / p.pageSize)),
  };
  return Response.json(
    envelope({ success: true, data: items, error: null, message: opts.message ?? "OK", pagination, meta: opts.meta }),
    { status: opts.status ?? 200, headers: opts.headers },
  );
}

export function fail(err: AppError | { code: string; status: number; message: string; details?: unknown }): Response {
  const headers = new Headers(err instanceof AppError ? err.headers : undefined);
  return Response.json(
    envelope({
      success: false,
      data: null,
      error: { code: err.code, ...(err.details !== undefined ? { details: err.details } : {}) },
      message: err.message,
      pagination: null,
    }),
    { status: err.status, headers },
  );
}
