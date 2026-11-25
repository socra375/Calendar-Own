// Dominio puro: fechas especiales anuales (29-feb → 28-feb en años no bisiestos).
import { addLocalDays } from "./time";

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Fecha 'YYYY-MM-DD' de la celebración en el año `year` (29-feb → 28-feb si no es bisiesto). */
export function occurrenceInYear(origin: string, year: number): string {
  const [, m, d] = origin.split("-").map(Number) as [number, number, number];
  const day = m === 2 && d === 29 && !isLeapYear(year) ? 28 : d;
  return `${pad(year, 4)}-${pad(m)}-${pad(day)}`;
}

/** Próxima ocurrencia en o después de `today` (null si no se repite y ya pasó). */
export function nextOccurrence(origin: string, recursYearly: boolean, today: string): string | null {
  if (!recursYearly) return origin >= today ? origin : null;
  const y = Number(today.slice(0, 4));
  const candidate = occurrenceInYear(origin, y);
  return candidate >= today ? candidate : occurrenceInYear(origin, y + 1);
}

/** Ocurrencias dentro de [from, to] (ambas fechas locales inclusivas). */
export function occurrencesBetween(origin: string, recursYearly: boolean, from: string, to: string): string[] {
  if (to < from) return [];
  if (!recursYearly) return origin >= from && origin <= to ? [origin] : [];
  const out: string[] = [];
  const originYear = Number(origin.slice(0, 4));
  for (let y = Math.max(originYear, Number(from.slice(0, 4))); y <= Number(to.slice(0, 4)); y++) {
    const o = occurrenceInYear(origin, y);
    if (o >= from && o <= to) out.push(o);
  }
  return out;
}

export function daysBetween(a: string, b: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export const yearsSince = (origin: string, occurrence: string) => Number(occurrence.slice(0, 4)) - Number(origin.slice(0, 4));

export { addLocalDays };
