"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiClientError, apiFetch, type Pagination } from "./api-client";

/** Contador global: cualquier mutación llama a bump() y todas las consultas visibles se revalidan. */
const VersionCtx = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => undefined });

export function VersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, bump }), [version, bump]);
  return <VersionCtx.Provider value={value}>{children}</VersionCtx.Provider>;
}
export const useVersion = () => useContext(VersionCtx);

interface State<T> {
  key: string;
  data?: T;
  error?: ApiClientError;
  pagination?: Pagination | null;
  meta?: Record<string, unknown>;
}

export interface Query<T> {
  data: T | undefined;
  error: ApiClientError | undefined;
  pagination: Pagination | null | undefined;
  meta: Record<string, unknown> | undefined;
  /** Primera carga (sin datos previos). */
  loading: boolean;
  /** Revalidando con datos antiguos en pantalla. */
  fetching: boolean;
  reload: () => void;
}

/** Fetch + revalidación simple (stale-while-revalidate). `path = null` deshabilita. */
export function useApiQuery<T>(path: string | null): Query<T> {
  const { version } = useVersion();
  const [local, setLocal] = useState(0);
  const [state, setState] = useState<State<T>>({ key: "" });
  const key = path ? `${path}#${version}#${local}` : "";

  useEffect(() => {
    if (!path) return;
    let alive = true;
    apiFetch<T>(path)
      .then((r) => alive && setState({ key, data: r.data, pagination: r.pagination, meta: r.meta }))
      .catch((e: unknown) =>
        alive &&
        setState((s) => ({
          key,
          data: s.data,
          error: e instanceof ApiClientError ? e : new ApiClientError("INTERNAL_ERROR", "Error de red", 0),
        })),
      );
    return () => {
      alive = false;
    };
  }, [key, path]);

  const settled = state.key === key;
  return {
    data: state.data,
    error: settled ? state.error : undefined,
    pagination: state.pagination,
    meta: state.meta,
    loading: path !== null && state.data === undefined && !(settled && state.error),
    fetching: path !== null && !settled,
    reload: () => setLocal((n) => n + 1),
  };
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

export function errMsg(e: unknown) {
  return e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : "Error desconocido";
}
