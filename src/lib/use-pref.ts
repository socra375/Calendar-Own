"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Preferencia por-visor en localStorage (con try/catch; SSR-safe vía useSyncExternalStore). */
export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      const h = (e: Event) => {
        if (!(e instanceof StorageEvent) || e.key === key) cb();
      };
      window.addEventListener("storage", h);
      window.addEventListener(`pref:${key}`, h);
      return () => {
        window.removeEventListener("storage", h);
        window.removeEventListener(`pref:${key}`, h);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = useCallback(
    (v: string) => {
      try {
        window.localStorage.setItem(key, v);
      } catch {
        /* sin almacenamiento */
      }
      window.dispatchEvent(new Event(`pref:${key}`));
    },
    [key],
  );
  return [value, set];
}

const noop = () => () => undefined;
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
