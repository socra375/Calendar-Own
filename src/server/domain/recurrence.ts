// Dominio puro: expansión de recurrencias (RFC 5545 vía `rrule`). Sin BD ni I/O.
//
// Estrategia de zona horaria: DTSTART es la hora de pared local del evento en su TZ. Se pasa a `rrule` como
// fecha "flotante" (los campos UTC del Date representan la hora local) y cada resultado se convierte de nuevo a
// un instante real con `localToUtc`, de modo que DST/offset son correctos en cada ocurrencia.
import { RRule, type Options } from "rrule";
import { addLocalDays, localToUtc, utcToLocal } from "./time";

export const MAX_OCCURRENCES = 2000;
const DAY_MS = 86_400_000;
const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export type EventStatus = "confirmed" | "tentative" | "cancelled";

export interface EventLike {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  isAllDay: boolean;
  startAt: Date | null;
  endAt: Date | null;
  startDate: string | null;
  endDate: string | null; // exclusivo
  timezone: string;
  categoryId: string | null;
  color: string | null;
  location: string | null;
  meetingUrl: string | null;
  meetingProvider: string | null;
  status: EventStatus;
  isBlocking: boolean;
}

export interface RecurrenceLike {
  rrule: string;
  seriesEndAt?: Date | null;
}

export interface Overrides {
  title?: string;
  description?: string | null;
  start?: string;
  end?: string;
  location?: string | null;
  status?: EventStatus;
  notes?: string | null;
  meetingUrl?: string | null;
  color?: string | null;
}

export interface ExceptionLike {
  occurrenceKey: string;
  kind: "cancelled" | "modified";
  overrides?: Overrides | null;
}

export interface Occurrence {
  /** Id del evento (serie). */
  id: string;
  seriesId: string | null;
  isRecurring: boolean;
  isException: boolean;
  /** Instante UTC ISO (con hora) o 'YYYY-MM-DD' (día completo): identidad original de la ocurrencia. */
  occurrenceKey: string;
  isAllDay: boolean;
  start: Date;
  end: Date;
  startDate: string | null;
  endDate: string | null; // exclusivo
  timezone: string;
  title: string;
  description: string | null;
  notes: string | null;
  location: string | null;
  meetingUrl: string | null;
  meetingProvider: string | null;
  color: string | null;
  status: EventStatus;
  categoryId: string | null;
  isBlocking: boolean;
}

// ---------- utilidades de fecha flotante ----------
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 'YYYY-MM-DD[THH:mm[:ss]]' → Date flotante (campos UTC = reloj de pared). */
export function floatingFromLocal(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local);
  if (!m) throw new RangeError(`Fecha local inválida: ${local}`);
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
}

/** Date flotante → 'YYYY-MM-DDTHH:mm:ss'. */
export function floatingToLocal(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const floatingDate = (d: Date) => floatingToLocal(d).slice(0, 10);

export function allDaySpanDays(event: Pick<EventLike, "startDate" | "endDate">): number {
  const a = floatingFromLocal(event.startDate!).getTime();
  const b = floatingFromLocal(event.endDate!).getTime();
  return Math.max(1, Math.round((b - a) / DAY_MS));
}

/** DTSTART flotante del evento (hora de pared local en su TZ). */
export function eventDtstart(event: EventLike, tz = event.timezone): Date {
  if (event.isAllDay) return floatingFromLocal(event.startDate!);
  return floatingFromLocal(utcToLocal(event.startAt!, tz));
}

export function occurrenceKeyFor(isAllDay: boolean, start: Date, tz: string): string {
  return isAllDay ? utcToLocal(start, tz).slice(0, 10) : start.toISOString();
}

// ---------- validación / construcción de RRULE ----------
const FORBIDDEN = /(DTSTART|EXDATE|RDATE|TZID|EXRULE)/i;

export function stripRrulePrefix(s: string): string {
  return s.trim().replace(/^RRULE:/i, "");
}

function parseOptions(rrule: string): Partial<Options> {
  return RRule.parseString(stripRrulePrefix(rrule));
}

/** Lanza RangeError si la regla no es válida o es peligrosa (sub-diaria, demasiadas repeticiones). */
export function validateRrule(rrule: string): void {
  if (rrule.length > 500 || /[\r\n]/.test(rrule)) throw new RangeError("RRULE inválida (longitud o saltos de línea)");
  if (FORBIDDEN.test(rrule)) throw new RangeError("RRULE no debe incluir DTSTART/EXDATE/RDATE/TZID");
  let opts: Partial<Options>;
  try {
    opts = parseOptions(rrule);
  } catch (e) {
    throw new RangeError(`RRULE inválida: ${(e as Error).message}`);
  }
  if (opts.freq === undefined || opts.freq === null) throw new RangeError("RRULE sin FREQ válido");
  if (opts.freq > RRule.DAILY) throw new RangeError("Solo se permiten frecuencias DAILY, WEEKLY, MONTHLY o YEARLY");
  if (opts.interval !== undefined && opts.interval !== null && (opts.interval < 1 || opts.interval > 999))
    throw new RangeError("INTERVAL fuera de rango (1-999)");
  if (opts.count !== undefined && opts.count !== null && (opts.count < 1 || opts.count > 5000))
    throw new RangeError("COUNT fuera de rango (1-5000)");
  try {
    new RRule({ ...opts, dtstart: new Date(Date.UTC(2026, 0, 1)) }).toString();
  } catch (e) {
    throw new RangeError(`RRULE inválida: ${(e as Error).message}`);
  }
}

const FREQ_MAP = { daily: RRule.DAILY, weekly: RRule.WEEKLY, monthly: RRule.MONTHLY, yearly: RRule.YEARLY } as const;

export interface RecurrenceSpec {
  freq: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval?: number;
  byDay?: WeekdayCode[];
  /** 'YYYY-MM-DD' (fecha local inclusiva) o instante ISO con offset. */
  until?: string;
  count?: number;
  rrule?: string;
}

/** Convierte el UNTIL de entrada a Date flotante (fin del día local si es fecha). */
function untilToFloating(until: string, tz: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(until)) return floatingFromLocal(`${until}T23:59:59`);
  return floatingFromLocal(utcToLocal(new Date(until), tz));
}

/** Construye la parte RRULE (sin DTSTART) a partir de la especificación de la UI/API. */
export function buildRrule(spec: RecurrenceSpec, tz: string): string {
  let opts: Partial<Options>;
  if (spec.freq === "custom") {
    if (!spec.rrule) throw new RangeError("freq=custom requiere rrule");
    validateRrule(spec.rrule);
    opts = parseOptions(spec.rrule);
  } else {
    opts = { freq: FREQ_MAP[spec.freq], interval: spec.interval ?? 1 };
    if (spec.freq === "weekly" && spec.byDay?.length) opts.byweekday = spec.byDay.map((d) => RRule[d]);
  }
  if (spec.until) {
    opts.until = untilToFloating(spec.until, tz);
    opts.count = undefined;
  } else if (spec.count) {
    opts.count = spec.count;
    opts.until = undefined;
  }
  const out = stripRrulePrefix(RRule.optionsToString(opts));
  validateRrule(out);
  return out;
}

export interface RecurrenceSummary {
  freq: "daily" | "weekly" | "monthly" | "yearly" | null;
  interval: number;
  byDay: WeekdayCode[];
  until: string | null;
  count: number | null;
}

export function summarizeRrule(rrule: string): RecurrenceSummary {
  const o = parseOptions(rrule);
  const freq =
    o.freq === RRule.DAILY ? "daily" : o.freq === RRule.WEEKLY ? "weekly" : o.freq === RRule.MONTHLY ? "monthly" : o.freq === RRule.YEARLY ? "yearly" : null;
  const bw = o.byweekday == null ? [] : Array.isArray(o.byweekday) ? o.byweekday : [o.byweekday];
  const byDay = bw
    .map((w) => (typeof w === "number" ? w : typeof w === "string" ? WEEKDAY_CODES.indexOf(w as WeekdayCode) : w.weekday))
    .filter((n) => n >= 0 && n < 7)
    .map((n) => WEEKDAY_CODES[n]!);
  let until: string | null = null;
  if (o.until) {
    const l = floatingToLocal(o.until);
    until = l.endsWith("T23:59:59") ? l.slice(0, 10) : l;
  }
  return { freq, interval: o.interval ?? 1, byDay, until, count: o.count ?? null };
}

function makeRule(rrule: string, dtstart: Date): RRule {
  return new RRule({ ...parseOptions(rrule), dtstart });
}

/** Fin real de la serie (fin de la última ocurrencia) o null si es infinita. */
export function computeSeriesEnd(event: EventLike, rrule: string, tz = event.timezone): Date | null {
  const opts = parseOptions(rrule);
  if (!opts.until && !opts.count) return null;
  const dtstart = eventDtstart(event, tz);
  const rule = makeRule(rrule, dtstart);
  let last: Date | null = null;
  rule.all((d, i) => {
    last = d;
    return i < 20_000;
  });
  const lastDate: Date = last ?? dtstart;
  return occurrenceFromFloating(event, lastDate, tz).end;
}

/**
 * Parte la regla en el instante flotante `split` (inicio de la ocurrencia elegida):
 * `head` termina justo antes (UNTIL); `tail` es la regla de la nueva serie (null si COUNT se agotó).
 */
export function splitRrule(rrule: string, dtstart: Date, split: Date): { head: string; tail: string | null } {
  const opts = parseOptions(rrule);
  const before = new Date(split.getTime() - 1000);
  const head = stripRrulePrefix(RRule.optionsToString({ ...opts, count: undefined, until: before }));
  let tail: string | null;
  if (opts.count) {
    const k = makeRule(rrule, dtstart).between(dtstart, before, true).length;
    const remaining = opts.count - k;
    tail = remaining > 0 ? stripRrulePrefix(RRule.optionsToString({ ...opts, count: remaining, until: undefined })) : null;
  } else {
    tail = stripRrulePrefix(RRule.optionsToString(opts));
  }
  return { head, tail };
}

/** ¿`key` es realmente una ocurrencia generada por la regla? */
export function isValidOccurrenceKey(event: EventLike, rrule: string | null, key: string, tz = event.timezone): boolean {
  if (!rrule) return key === baseKey(event, tz);
  const f = keyToFloating(event, key, tz);
  if (!f) return false;
  return makeRule(rrule, eventDtstart(event, tz)).between(f, f, true).length === 1;
}

function baseKey(event: EventLike, tz: string): string {
  return event.isAllDay ? event.startDate! : occurrenceKeyFor(false, event.startAt!, tz);
}

function keyToFloating(event: EventLike, key: string, tz: string): Date | null {
  if (event.isAllDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    return floatingFromLocal(key);
  }
  const d = new Date(key);
  if (Number.isNaN(d.getTime()) || d.toISOString() !== key) return null;
  return floatingFromLocal(utcToLocal(d, tz));
}

// ---------- construcción de ocurrencias ----------
function baseOccurrence(event: EventLike, start: Date, end: Date, key: string, recurring: boolean): Occurrence {
  return {
    id: event.id,
    seriesId: recurring ? event.id : null,
    isRecurring: recurring,
    isException: false,
    occurrenceKey: key,
    isAllDay: event.isAllDay,
    start,
    end,
    startDate: event.isAllDay ? utcToLocal(start, event.timezone).slice(0, 10) : null,
    endDate: event.isAllDay ? utcToLocal(end, event.timezone).slice(0, 10) : null,
    timezone: event.timezone,
    title: event.title,
    description: event.description,
    notes: event.notes,
    location: event.location,
    meetingUrl: event.meetingUrl,
    meetingProvider: event.meetingProvider,
    color: event.color,
    status: event.status,
    categoryId: event.categoryId,
    isBlocking: event.isBlocking,
  };
}

function occurrenceFromFloating(event: EventLike, f: Date, tz: string, recurring = true): Occurrence {
  if (event.isAllDay) {
    const date = floatingDate(f);
    const start = localToUtc(date, tz);
    const end = localToUtc(addLocalDays(date, allDaySpanDays(event)), tz);
    const o = baseOccurrence({ ...event, timezone: tz }, start, end, date, recurring);
    o.startDate = date;
    o.endDate = addLocalDays(date, allDaySpanDays(event));
    return o;
  }
  const dur = event.endAt!.getTime() - event.startAt!.getTime();
  const start = localToUtc(floatingToLocal(f), tz);
  const end = new Date(start.getTime() + dur);
  return baseOccurrence({ ...event, timezone: tz }, start, end, start.toISOString(), recurring);
}

function applyOverrides(base: Occurrence, ov: Overrides | null | undefined): Occurrence {
  const o: Occurrence = { ...base, isException: true };
  if (!ov) return o;
  if (ov.title !== undefined) o.title = ov.title;
  if (ov.description !== undefined) o.description = ov.description;
  if (ov.notes !== undefined) o.notes = ov.notes;
  if (ov.location !== undefined) o.location = ov.location;
  if (ov.meetingUrl !== undefined) o.meetingUrl = ov.meetingUrl;
  if (ov.color !== undefined) o.color = ov.color;
  if (ov.status !== undefined) o.status = ov.status;
  if (o.isAllDay) {
    const span = Math.round((floatingFromLocal(base.endDate!).getTime() - floatingFromLocal(base.startDate!).getTime()) / DAY_MS);
    if (ov.start) {
      o.startDate = ov.start.slice(0, 10);
      o.start = localToUtc(o.startDate, o.timezone);
      o.endDate = addLocalDays(o.startDate, span);
      o.end = localToUtc(o.endDate, o.timezone);
    }
    if (ov.end) {
      o.endDate = ov.end.slice(0, 10);
      o.end = localToUtc(o.endDate, o.timezone);
    }
  } else {
    const dur = base.end.getTime() - base.start.getTime();
    if (ov.start) {
      o.start = new Date(ov.start);
      o.end = new Date(o.start.getTime() + dur);
    }
    if (ov.end) o.end = new Date(ov.end);
  }
  return o;
}

const overlaps = (o: { start: Date; end: Date }, from: Date, to: Date) =>
  o.start < to && (o.end > from || o.start >= from);

export interface ExpandResult {
  occurrences: Occurrence[];
  /** true si se alcanzó el límite de seguridad de ocurrencias. */
  truncated: boolean;
}

/**
 * Expande un evento (único o serie) en ocurrencias que solapan [rangeStart, rangeEnd).
 * Aplica excepciones (cancelled se omite; modified aplica overrides). Límite de seguridad: MAX_OCCURRENCES.
 */
export function expandWithMeta(
  event: EventLike,
  recurrence: RecurrenceLike | null | undefined,
  exceptions: ExceptionLike[],
  rangeStart: Date,
  rangeEnd: Date,
  tz: string = event.timezone,
  maxOccurrences = MAX_OCCURRENCES,
): ExpandResult {
  if (!recurrence) {
    const single = event.isAllDay
      ? occurrenceFromFloating(event, floatingFromLocal(event.startDate!), tz, false)
      : baseOccurrence({ ...event, timezone: tz }, event.startAt!, event.endAt!, event.startAt!.toISOString(), false);
    return { occurrences: overlaps(single, rangeStart, rangeEnd) ? [single] : [], truncated: false };
  }

  const excByKey = new Map(exceptions.map((e) => [e.occurrenceKey, e]));
  const dtstart = eventDtstart(event, tz);
  const spanMs = event.isAllDay ? allDaySpanDays(event) * DAY_MS : event.endAt!.getTime() - event.startAt!.getTime();
  const lower = new Date(floatingFromLocal(utcToLocal(new Date(rangeStart.getTime() - spanMs), tz)).getTime() - 2 * DAY_MS);
  const upper = new Date(floatingFromLocal(utcToLocal(rangeEnd, tz)).getTime() + 2 * DAY_MS);

  const rule = makeRule(recurrence.rrule, dtstart);
  let truncated = false;
  const dates = rule.between(lower, upper, true, (_d, i) => {
    if (i >= maxOccurrences) {
      truncated = true;
      return false;
    }
    return true;
  });

  const out: Occurrence[] = [];
  const seen = new Set<string>();
  for (const f of dates) {
    const base = occurrenceFromFloating(event, f, tz);
    seen.add(base.occurrenceKey);
    const exc = excByKey.get(base.occurrenceKey);
    if (exc?.kind === "cancelled") continue;
    const occ = exc ? applyOverrides(base, exc.overrides) : base;
    if (overlaps(occ, rangeStart, rangeEnd)) out.push(occ);
  }
  // Ocurrencias modificadas cuya fecha original cae fuera de la ventana pero que se movieron dentro del rango.
  for (const exc of exceptions) {
    if (exc.kind !== "modified" || seen.has(exc.occurrenceKey)) continue;
    const f = keyToFloating(event, exc.occurrenceKey, tz);
    if (!f) continue;
    const occ = applyOverrides(occurrenceFromFloating(event, f, tz), exc.overrides);
    if (overlaps(occ, rangeStart, rangeEnd)) out.push(occ);
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
  return { occurrences: out, truncated };
}

export function expandOccurrences(
  event: EventLike,
  recurrence: RecurrenceLike | null | undefined,
  exceptions: ExceptionLike[],
  rangeStart: Date,
  rangeEnd: Date,
  tz: string = event.timezone,
): Occurrence[] {
  return expandWithMeta(event, recurrence, exceptions, rangeStart, rangeEnd, tz).occurrences;
}

/** Ocurrencia concreta por clave (null si la clave no pertenece a la serie o está cancelada). */
export function occurrenceForKey(
  event: EventLike,
  recurrence: RecurrenceLike | null | undefined,
  exceptions: ExceptionLike[],
  key: string,
  tz: string = event.timezone,
): Occurrence | null {
  if (!isValidOccurrenceKey(event, recurrence?.rrule ?? null, key, tz)) return null;
  const exc = exceptions.find((e) => e.occurrenceKey === key);
  if (exc?.kind === "cancelled") return null;
  const f = keyToFloating(event, key, tz)!;
  const base = occurrenceFromFloating(event, f, tz, Boolean(recurrence));
  return exc ? applyOverrides(base, exc.overrides) : base;
}

/** El evento tal cual está guardado (primera ocurrencia / evento único), sin excepciones. */
export function masterOccurrence(event: EventLike, recurring: boolean, tz: string = event.timezone): Occurrence {
  if (event.isAllDay) return occurrenceFromFloating(event, floatingFromLocal(event.startDate!), tz, recurring);
  return baseOccurrence({ ...event, timezone: tz }, event.startAt!, event.endAt!, event.startAt!.toISOString(), recurring);
}

export { keyToFloating };
