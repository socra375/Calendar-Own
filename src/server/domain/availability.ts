// Dominio puro: disponibilidad (ocupado fusionado y huecos libres).
import type { Occurrence } from "./recurrence";
import { addLocalDays, toLocalDate, workingWindow, type DateRange } from "./time";

export interface BusyItem {
  eventId: string;
  occurrenceKey: string;
  start: Date;
  end: Date;
}

export interface MergedBusy {
  start: Date;
  end: Date;
  eventIds: string[];
}

export interface FreeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

/**
 * Una ocurrencia ocupa tiempo si no está cancelada y, siendo de día completo, es bloqueante
 * (entonces ocupa el día local completo: su start/end ya son los límites del día).
 */
export function occurrenceToBusy(o: Occurrence): BusyItem | null {
  if (o.status === "cancelled") return null;
  if (o.isAllDay && !o.isBlocking) return null;
  if (o.end <= o.start) return null; // duración cero no ocupa
  return { eventId: o.id, occurrenceKey: o.occurrenceKey, start: o.start, end: o.end };
}

/** Fusiona intervalos solapados o contiguos. Entrada sin ordenar. */
export function mergeBusy(items: BusyItem[]): MergedBusy[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
  const out: MergedBusy[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.start.getTime() <= last.end.getTime()) {
      if (it.end > last.end) last.end = it.end;
      if (!last.eventIds.includes(it.eventId)) last.eventIds.push(it.eventId);
    } else {
      out.push({ start: it.start, end: it.end, eventIds: [it.eventId] });
    }
  }
  return out;
}

/** Recorta intervalos fusionados a [from, to). */
export function clipBusy(busy: MergedBusy[], from: Date, to: Date): MergedBusy[] {
  return busy
    .filter((b) => b.end > from && b.start < to)
    .map((b) => ({ ...b, start: b.start < from ? from : b.start, end: b.end > to ? to : b.end }));
}

/** Ventanas laborales [from,to) de cada día local que toca el rango [from, to). */
export function workingWindowsBetween(
  from: Date,
  to: Date,
  tz: string,
  cfg: { workDayStart: string; workDayEnd: string; workDays: number[] },
): DateRange[] {
  const out: DateRange[] = [];
  let day = addLocalDays(toLocalDate(from, tz), -1);
  const last = toLocalDate(to, tz);
  for (let guard = 0; guard < 800 && day <= last; guard++) {
    const w = workingWindow(day, tz, cfg);
    if (w && w.to > from && w.from < to) out.push({ from: w.from < from ? from : w.from, to: w.to > to ? to : w.to });
    day = addLocalDays(day, 1);
  }
  return out;
}

/**
 * Huecos libres maximales de [from,to) (o de las ventanas dadas) con duración >= durationMinutes.
 * `busy` debe venir fusionado (mergeBusy).
 */
export function computeFreeSlots(opts: {
  from: Date;
  to: Date;
  busy: MergedBusy[];
  durationMinutes: number;
  windows?: DateRange[];
}): FreeSlot[] {
  const { from, to, durationMinutes } = opts;
  const windows = opts.windows ?? [{ from, to }];
  const busy = clipBusy(opts.busy, from, to);
  const minMs = durationMinutes * 60_000;
  const slots: FreeSlot[] = [];
  for (const w of windows) {
    let cursor = w.from;
    const push = (s: Date, e: Date) => {
      if (e.getTime() - s.getTime() >= minMs && e > s)
        slots.push({ start: s, end: e, durationMinutes: Math.round((e.getTime() - s.getTime()) / 60_000) });
    };
    for (const b of busy) {
      if (b.end <= cursor) continue;
      if (b.start >= w.to) break;
      if (b.start > cursor) push(cursor, b.start);
      if (b.end > cursor) cursor = b.end;
    }
    if (cursor < w.to) push(cursor, w.to);
  }
  return slots;
}
