import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { RRule } from "rrule";
import type { DbOrTx } from "../db/client";
import { eventExceptions, eventRecurrence, events } from "../db/schema";
import { addLocalDays, localToUtc, toLocalDate, utcToLocal } from "../domain/time";

/**
 * Expansión LOCAL de ocurrencias de eventos para el procesador de recordatorios.
 *
 * Interfaz estrecha a propósito: cuando `domain/recurrence.ts` esté disponible basta con reimplementar
 * `listOccurrencesInRange` sobre ella (misma firma y mismo formato de `occurrenceKey`).
 *
 * Reglas (contrato docs/ARCHITECTURE.md §5): DTSTART flotante en la TZ del evento; `occurrenceKey` =
 * instante UTC ISO (`toISOString()`) para eventos con hora y `YYYY-MM-DD` para día completo; excepciones
 * `cancelled` (o `modified` con status cancelled) se omiten; `modified` aplica overrides de start/title/location.
 * Límites: una excepción modificada que mueva la ocurrencia más de 1 día fuera de [from,to) no se detecta.
 */
export interface EventOccurrence {
  eventId: string;
  occurrenceKey: string;
  start: Date;
  isAllDay: boolean;
  title: string;
  location: string | null;
  timezone: string;
}

const DAY = 86_400_000;
const floating = (local: string) => new Date(local.slice(0, 19) + "Z");

export async function listOccurrencesInRange(
  db: DbOrTx,
  userId: string,
  from: Date,
  to: Date,
): Promise<EventOccurrence[]> {
  const d0 = addLocalDays(toLocalDate(from, "UTC"), -2);
  const d1 = addLocalDays(toLocalDate(to, "UTC"), 2);
  const rows = await db
    .select({ e: events, rrule: eventRecurrence.rrule })
    .from(events)
    .leftJoin(eventRecurrence, eq(eventRecurrence.eventId, events.id))
    .where(
      and(
        eq(events.userId, userId),
        isNull(events.deletedAt),
        ne(events.status, "cancelled"),
        or(
          and(isNotNull(eventRecurrence.rrule), or(isNull(eventRecurrence.seriesEndAt), gte(eventRecurrence.seriesEndAt, from))),
          and(
            isNull(eventRecurrence.rrule),
            or(and(gte(events.startAt, from), lt(events.startAt, to)), and(gte(events.startDate, d0), lte(events.startDate, d1))),
          ),
        ),
      ),
    );

  const recurringIds = rows.filter((r) => r.rrule).map((r) => r.e.id);
  const exceptions = recurringIds.length
    ? await db.select().from(eventExceptions).where(inArray(eventExceptions.eventId, recurringIds))
    : [];
  const exByEvent = new Map<string, Map<string, (typeof exceptions)[number]>>();
  for (const x of exceptions) {
    if (!exByEvent.has(x.eventId)) exByEvent.set(x.eventId, new Map());
    exByEvent.get(x.eventId)!.set(x.occurrenceKey, x);
  }

  const out: EventOccurrence[] = [];
  const inRange = (d: Date) => d >= from && d < to;
  const base = (e: (typeof rows)[number]["e"]) => ({
    eventId: e.id,
    isAllDay: e.isAllDay,
    title: e.title,
    location: e.location,
    timezone: e.timezone,
  });

  for (const { e, rrule } of rows) {
    const tz = e.timezone;
    const startLocal = e.isAllDay ? `${e.startDate}T00:00:00` : utcToLocal(e.startAt!, tz);
    if (!rrule) {
      const start = e.isAllDay ? localToUtc(e.startDate!, tz) : e.startAt!;
      if (!inRange(start)) continue;
      out.push({ ...base(e), occurrenceKey: e.isAllDay ? e.startDate! : e.startAt!.toISOString(), start });
      continue;
    }
    let rule: RRule;
    try {
      rule = new RRule({ ...RRule.parseString(rrule.replace(/^RRULE:/i, "")), dtstart: floating(startLocal) });
    } catch {
      continue; // regla corrupta: no se notifica (el servicio de eventos la valida al guardar)
    }
    const lo = new Date(floating(utcToLocal(from, tz)).getTime() - DAY);
    const hi = new Date(floating(utcToLocal(to, tz)).getTime() + DAY);
    const exs = exByEvent.get(e.id);
    for (const occ of rule.between(lo, hi, true)) {
      const localStr = occ.toISOString().slice(0, 19);
      const instant = localToUtc(localStr, tz);
      const key = e.isAllDay ? localStr.slice(0, 10) : instant.toISOString();
      let start = e.isAllDay ? localToUtc(key, tz) : instant;
      let title = e.title;
      let location = e.location;
      const ex = exs?.get(key);
      if (ex) {
        if (ex.kind === "cancelled") continue;
        const o = ex.overrides ?? {};
        if (o.status === "cancelled") continue;
        if (o.start) {
          const s = new Date(o.start);
          if (!Number.isNaN(s.getTime())) start = s;
        }
        if (o.title) title = o.title;
        if (o.location !== undefined) location = o.location;
      }
      if (!inRange(start)) continue;
      out.push({ ...base(e), title, location, occurrenceKey: key, start });
    }
  }
  return out;
}
