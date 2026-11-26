import type { DbOrTx } from "../db/client";
import { MAX_OCCURRENCES, expandWithMeta, validateRrule } from "../domain/recurrence";
import { bundlesInRange, toLike } from "../services/events.service";
import { safeErrorLog } from "../safe-log";

/**
 * Ocurrencias de eventos para el procesador de recordatorios: capa fina sobre `domain/recurrence.ts`
 * (la misma expansión que usa el calendario, con todas sus excepciones/overrides) y sobre la misma consulta
 * de candidatos que `fetchOccurrences`.
 *
 * - `occurrenceKey` = identidad ORIGINAL de la ocurrencia: `YYYY-MM-DD` (día completo) o instante UTC ISO.
 * - Se omiten las ocurrencias canceladas (excepción `cancelled`, `modified` con status cancelled, evento cancelado).
 * - Se usa solapamiento con [from, to); `start` refleja los overrides (p. ej. ocurrencia movida).
 * - Una regla inválida o un fallo de expansión no aborta el ciclo: se registra (sin datos sensibles) y se sigue.
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

export async function listOccurrencesInRange(db: DbOrTx, userId: string, from: Date, to: Date): Promise<EventOccurrence[]> {
  const bundles = await bundlesInRange(userId, from, to, {}, "UTC", db);
  const out: EventOccurrence[] = [];
  for (const b of bundles) {
    try {
      if (b.rec) validateRrule(b.rec.rrule);
      const r = expandWithMeta(toLike(b.ev), b.rec, b.exc as never, from, to, b.ev.timezone, MAX_OCCURRENCES);
      if (r.truncated) console.error(`[occurrences] serie truncada en ${MAX_OCCURRENCES} ocurrencias eventId=${b.ev.id}`);
      for (const o of r.occurrences) {
        if (o.status === "cancelled") continue;
        out.push({
          eventId: o.id,
          occurrenceKey: o.occurrenceKey,
          start: o.start,
          isAllDay: o.isAllDay,
          title: o.title,
          location: o.location,
          timezone: o.timezone,
        });
      }
    } catch (e) {
      safeErrorLog(e, `[occurrences] evento omitido por regla inválida eventId=${b.ev.id}`);
    }
  }
  return out;
}
