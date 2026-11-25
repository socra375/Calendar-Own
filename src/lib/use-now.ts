"use client";

import { useSyncExternalStore } from "react";

let current = 0;
function snapshot() {
  const m = Math.floor(Date.now() / 30_000) * 30_000;
  if (m !== current) current = m;
  return current;
}
function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
}
/** Reloj reactivo (se actualiza cada 30 s). Devuelve 0 en SSR/primer render: tratar 0 como "aún sin hora". */
export function useNow() {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
