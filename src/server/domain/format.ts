// Formato de fechas para respuestas: ISO con offset de la zona dada + campos locales explícitos.
import { TZDate } from "@date-fns/tz";
import { addLocalDays, startOfLocalDay, startOfNextLocalDay, toLocalDate, utcToLocal, type DateRange } from "./time";

/** ISO 8601 con offset de `tz` (p. ej. 2026-03-02T09:00:00.000-04:00). */
export function toIso(d: Date, tz: string): string {
  return new TZDate(d.getTime(), tz).toISOString();
}
export const toIsoOrNull = (d: Date | null | undefined, tz: string) => (d ? toIso(d, tz) : null);

/** 'HH:mm' local. */
export function localTime(d: Date, tz: string): string {
  return utcToLocal(d, tz).slice(11, 16);
}

export const WEEKDAY_NAMES_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export function weekdayName(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return WEEKDAY_NAMES_ES[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

export const MAX_RANGE_DAYS = 731;

/**
 * Resuelve from/to de la API a un rango semiabierto [from,to).
 * - Fecha 'YYYY-MM-DD': día local en `tz`; en `to` se interpreta como día INCLUSIVO.
 * - Instante ISO: se usa tal cual.
 */
export function resolveRange(from: string, to: string, tz: string): DateRange {
  const f = /^\d{4}-\d{2}-\d{2}$/.test(from) ? startOfLocalDay(from, tz) : new Date(from);
  const t = /^\d{4}-\d{2}-\d{2}$/.test(to) ? startOfNextLocalDay(to, tz) : new Date(to);
  return { from: f, to: t };
}

/** Resuelve solo un extremo opcional. */
export function resolveBound(v: string, tz: string, kind: "from" | "to"): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return kind === "from" ? startOfLocalDay(v, tz) : startOfNextLocalDay(v, tz);
  return new Date(v);
}

export { addLocalDays, toLocalDate };
