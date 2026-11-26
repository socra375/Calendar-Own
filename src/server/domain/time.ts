// Dominio puro de tiempo: sin BD ni I/O. Todas las funciones reciben la TZ IANA explícita.
import { TZDate } from "@date-fns/tz";

export type LocalDate = string; // 'YYYY-MM-DD'
export type RelativeRange = "today" | "tomorrow" | "yesterday" | "week" | "next_week";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=domingo..6=sábado
}

/** Descompone un instante en sus componentes de reloj de pared en `tz`. */
export function utcToLocalParts(instant: Date, tz: string): LocalParts {
  const d = new TZDate(instant.getTime(), tz);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
    weekday: d.getDay(),
  };
}

/** Fecha local 'YYYY-MM-DD' de un instante en `tz`. */
export function toLocalDate(instant: Date, tz: string): LocalDate {
  const p = utcToLocalParts(instant, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Fecha-hora local 'YYYY-MM-DDTHH:mm:ss' (sin offset) de un instante en `tz`. */
export function utcToLocal(instant: Date, tz: string): string {
  const p = utcToLocalParts(instant, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Convierte una hora de pared local ('YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm[:ss]') en `tz` al instante UTC.
 * En huecos de DST se desplaza hacia adelante; en solapamientos toma la primera ocurrencia.
 */
export function localToUtc(local: string, tz: string): Date {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new RangeError(`Fecha local inválida: ${local}`);
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const date = new TZDate(+y!, +mo! - 1, +d!, +h, +mi, +s, 0, tz);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Fecha local inválida: ${local}`);
  return new Date(date.getTime());
}

/** Suma `n` días a una fecha local (aritmética de calendario pura, sin TZ). */
export function addLocalDays(date: LocalDate, n: number): LocalDate {
  const m = LOCAL_RE.exec(date);
  if (!m) throw new RangeError(`Fecha inválida: ${date}`);
  const t = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]! + n);
  const d = new Date(t);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Día de la semana (0=domingo) de una fecha local. */
export function weekdayOf(date: LocalDate): number {
  const m = LOCAL_RE.exec(date)!;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).getUTCDay();
}

const asLocalDate = (v: Date | LocalDate, tz: string): LocalDate => (typeof v === "string" ? v.slice(0, 10) : toLocalDate(v, tz));

/** Instante UTC del inicio (00:00 local) del día que contiene `v`. */
export function startOfLocalDay(v: Date | LocalDate, tz: string): Date {
  return localToUtc(asLocalDate(v, tz), tz);
}

/** Inicio del día siguiente (límite exclusivo). Correcto en días de 23/25 h. */
export function startOfNextLocalDay(v: Date | LocalDate, tz: string): Date {
  return localToUtc(addLocalDays(asLocalDate(v, tz), 1), tz);
}

/** Último milisegundo del día local (inclusivo). Prefiere rangos semiabiertos [start, nextStart). */
export function endOfLocalDay(v: Date | LocalDate, tz: string): Date {
  return new Date(startOfNextLocalDay(v, tz).getTime() - 1);
}

export interface DateRange {
  from: Date; // inclusivo
  to: Date; // exclusivo
}

/** Rango semiabierto [from, to) de un día local. */
export function localDayRange(v: Date | LocalDate, tz: string): DateRange {
  return { from: startOfLocalDay(v, tz), to: startOfNextLocalDay(v, tz) };
}

/** Inicio (fecha local) de la semana que contiene `date`, según weekStartsOn (0=domingo, 1=lunes). */
export function startOfLocalWeek(date: LocalDate, weekStartsOn = 1): LocalDate {
  const diff = (weekdayOf(date) - weekStartsOn + 7) % 7;
  return addLocalDays(date, -diff);
}

/** Rango "hoy / mañana / ayer / semana / próxima semana" en la TZ del usuario, semiabierto. */
export function relativeRange(
  kind: RelativeRange,
  tz: string,
  now: Date = new Date(),
  weekStartsOn = 1,
): DateRange {
  const today = toLocalDate(now, tz);
  switch (kind) {
    case "today":
      return localDayRange(today, tz);
    case "tomorrow":
      return localDayRange(addLocalDays(today, 1), tz);
    case "yesterday":
      return localDayRange(addLocalDays(today, -1), tz);
    case "week": {
      const s = startOfLocalWeek(today, weekStartsOn);
      return { from: startOfLocalDay(s, tz), to: startOfLocalDay(addLocalDays(s, 7), tz) };
    }
    case "next_week": {
      const s = addLocalDays(startOfLocalWeek(today, weekStartsOn), 7);
      return { from: startOfLocalDay(s, tz), to: startOfLocalDay(addLocalDays(s, 7), tz) };
    }
  }
}

/** 'HH:mm' o 'HH:mm:ss' → minutos desde medianoche. */
export function parseTimeOfDay(t: string): number {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(t);
  if (!m) throw new RangeError(`Hora inválida: ${t}`);
  return +m[1]! * 60 + +m[2]!;
}

/** Instante UTC de `HH:mm` local en una fecha local dada. */
export function localTimeOnDate(date: LocalDate, time: string, tz: string): Date {
  const mins = parseTimeOfDay(time);
  return localToUtc(`${date}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`, tz);
}

/** Rango UTC [from, to) de un evento de día completo (end_date exclusivo) interpretado en `tz`. */
export function allDayToRange(startDate: LocalDate, endDateExclusive: LocalDate, tz: string): DateRange {
  return { from: startOfLocalDay(startDate, tz), to: startOfLocalDay(endDateExclusive, tz) };
}

/** Horario laboral [from, to) de una fecha local, o null si no es día laborable. */
export function workingWindow(
  date: LocalDate,
  tz: string,
  cfg: { workDayStart: string; workDayEnd: string; workDays: number[] },
): DateRange | null {
  if (!cfg.workDays.includes(weekdayOf(date))) return null;
  const from = localTimeOnDate(date, cfg.workDayStart, tz);
  const to = localTimeOnDate(date, cfg.workDayEnd, tz);
  return to > from ? { from, to } : null;
}
