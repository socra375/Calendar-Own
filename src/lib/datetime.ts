// Utilidades de fecha/hora con zona horaria del usuario (Intl + @date-fns/tz). Seguro para el cliente.
import { TZDate } from "@date-fns/tz";

const p2 = (n: number) => String(n).padStart(2, "0");

export function wall(d: Date | string | number, tz: string) {
  const t = TZDate.tz(tz, typeof d === "string" ? new Date(d).getTime() : d instanceof Date ? d.getTime() : d);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), h: t.getHours(), mi: t.getMinutes(), s: t.getSeconds(), dow: t.getDay() };
}
export function localDate(d: Date | string | number, tz: string) {
  const w = wall(d, tz);
  return `${w.y}-${p2(w.m)}-${p2(w.d)}`;
}
export function localTime(d: Date | string | number, tz: string) {
  const w = wall(d, tz);
  return `${p2(w.h)}:${p2(w.mi)}`;
}
/** 'YYYY-MM-DD' + 'HH:mm' en `tz` → instante ISO (UTC, 'Z'). */
export function zonedToIso(date: string, time: string, tz: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, h!, mi!, 0, tz).getTime()).toISOString();
}
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}
/** Fecha "flotante" (la hora de pared como si fuera UTC): lo que FullCalendar (timeZone=UTC) muestra. */
export function floating(d: Date | string | number, tz: string) {
  const w = wall(d, tz);
  return new Date(Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s));
}
/** Inverso: Date flotante de FullCalendar → ISO real en `tz`. */
export function floatingToIso(f: Date, tz: string) {
  return zonedToIso(
    `${f.getUTCFullYear()}-${p2(f.getUTCMonth() + 1)}-${p2(f.getUTCDate())}`,
    `${p2(f.getUTCHours())}:${p2(f.getUTCMinutes())}`,
    tz,
  );
}
export function floatingDate(f: Date) {
  return `${f.getUTCFullYear()}-${p2(f.getUTCMonth() + 1)}-${p2(f.getUTCDate())}`;
}

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, opts: Intl.DateTimeFormatOptions) {
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat("es", { ...opts, timeZone: "UTC" })));
  return f;
}
const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
export const fmtDateLong = (date: string) => fmt("long", { weekday: "long", day: "numeric", month: "long" }).format(asUtc(date));
export const fmtDateShort = (date: string) => fmt("short", { weekday: "short", day: "numeric", month: "short" }).format(asUtc(date));
export const fmtDateFull = (date: string) => fmt("full", { day: "numeric", month: "short", year: "numeric" }).format(asUtc(date));
export const fmtMonthDay = (date: string) => fmt("md", { day: "numeric", month: "long" }).format(asUtc(date));
export const fmtWeekday = (date: string) => fmt("wd", { weekday: "long" }).format(asUtc(date));

export function fmtDateTime(iso: string, tz: string) {
  const d = localDate(iso, tz);
  return `${fmtDateShort(d)} · ${localTime(iso, tz)}`;
}
export function fmtDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function relativeFromNow(iso: string, nowMs: number) {
  const diff = Math.round((Date.parse(iso) - nowMs) / 60000);
  const abs = Math.abs(diff);
  const r = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (abs < 60) return r.format(diff, "minute");
  if (abs < 60 * 24) return r.format(Math.round(diff / 60), "hour");
  return r.format(Math.round(diff / 1440), "day");
}
export function minutesLabel(min: number) {
  if (min === 0) return "En el momento";
  if (min % 10080 === 0) return `${min / 10080} sem antes`;
  if (min % 1440 === 0) return `${min / 1440} d antes`;
  if (min % 60 === 0) return `${min / 60} h antes`;
  return `${min} min antes`;
}
export const nowMs = () => Date.now();
