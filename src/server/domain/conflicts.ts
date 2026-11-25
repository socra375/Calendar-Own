// Dominio puro: detección de solapamientos.
import { occurrenceToBusy } from "./availability";
import type { Occurrence } from "./recurrence";

export interface ConflictItem {
  eventId: string;
  occurrenceKey: string;
  title: string;
  start: Date;
  end: Date;
  isBlocking: boolean;
  isAllDay: boolean;
}

export interface CandidateInterval {
  start: Date;
  end: Date;
}

/**
 * Devuelve los eventos existentes que solapan con alguno de los intervalos candidatos.
 * Reglas: cancelados no cuentan; día completo solo si es bloqueante; intervalos de duración cero no chocan.
 * `ignoreEventId` excluye el propio evento (ediciones) .
 */
export function findConflicts(
  candidates: CandidateInterval[],
  existing: Occurrence[],
  opts: { ignoreEventId?: string } = {},
): ConflictItem[] {
  const found = new Map<string, ConflictItem>();
  for (const o of existing) {
    if (opts.ignoreEventId && o.id === opts.ignoreEventId) continue;
    const busy = occurrenceToBusy(o);
    if (!busy) continue;
    for (const c of candidates) {
      if (c.end <= c.start) continue;
      if (c.start < busy.end && busy.start < c.end) {
        found.set(`${o.id}|${o.occurrenceKey}`, {
          eventId: o.id,
          occurrenceKey: o.occurrenceKey,
          title: o.title,
          start: o.start,
          end: o.end,
          isBlocking: o.isBlocking,
          isAllDay: o.isAllDay,
        });
        break;
      }
    }
  }
  return [...found.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Conflictos que impiden guardar sin `force`. */
export const blockingConflicts = (c: ConflictItem[]) => c.filter((x) => x.isBlocking);
