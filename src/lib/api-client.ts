// Cliente fetch tipado para el envelope de la API (seguro para el cliente).
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; details?: unknown } | null;
  message: string;
  pagination: Pagination | null;
  meta: { requestId: string; conflicts?: unknown[]; [k: string]: unknown };
}

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<ApiEnvelope<T> & { data: T }> {
  const { body, headers, ...rest } = init;
  const res = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    /* respuesta no JSON */
  }
  if (!json || !json.success) {
    throw new ApiClientError(
      json?.error?.code ?? "INTERNAL_ERROR",
      json?.message ?? `HTTP ${res.status}`,
      res.status,
      json?.error?.details,
      json?.meta?.requestId,
    );
  }
  return json as ApiEnvelope<T> & { data: T };
}
