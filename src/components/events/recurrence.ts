import type { RecurrenceInput } from "@/lib/validation/events";
import type { EventDto } from "@/lib/types";

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
export const WEEKDAY_LABELS: { code: Weekday; short: string; long: string }[] = [
  { code: "MO", short: "L", long: "Lunes" },
  { code: "TU", short: "M", long: "Martes" },
  { code: "WE", short: "X", long: "Miércoles" },
  { code: "TH", short: "J", long: "Jueves" },
  { code: "FR", short: "V", long: "Viernes" },
  { code: "SA", short: "S", long: "Sábado" },
  { code: "SU", short: "D", long: "Domingo" },
];
/** Date.getDay() (0=domingo) → código RRULE. */
export const dowToCode = (dow: number): Weekday => (["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const)[dow]!;

export interface RecForm {
  freq: "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval: number;
  byDay: Weekday[];
  end: "never" | "until" | "count";
  until: string;
  count: number;
  rrule: string;
}
export const NO_REC: RecForm = { freq: "none", interval: 1, byDay: [], end: "never", until: "", count: 10, rrule: "" };

export const CUSTOM_PRESETS: { label: string; rrule: string }[] = [
  { label: "Cada 2 semanas (lun y jue)", rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH" },
  { label: "Primer lunes de cada mes", rrule: "FREQ=MONTHLY;BYDAY=1MO" },
  { label: "Último viernes de cada mes", rrule: "FREQ=MONTHLY;BYDAY=-1FR" },
  { label: "Día 15 de cada mes", rrule: "FREQ=MONTHLY;BYMONTHDAY=15" },
  { label: "Cada día laborable", rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
];

const SIMPLE_KEYS = new Set(["FREQ", "INTERVAL", "BYDAY", "UNTIL", "COUNT", "WKST"]);

export function recFromEvent(ev: Pick<EventDto, "recurrence" | "isRecurring">): RecForm {
  const r = ev.recurrence;
  if (!r) return NO_REC;
  const parts = Object.fromEntries(r.rrule.split(";").map((p) => p.split("=") as [string, string]));
  const simple =
    r.freq !== null &&
    Object.keys(parts).every((k) => SIMPLE_KEYS.has(k)) &&
    (r.freq === "weekly" || !("BYDAY" in parts)) &&
    !/\d[A-Z]{2}/.test(parts.BYDAY ?? "");
  const end: RecForm["end"] = r.until ? "until" : r.count ? "count" : "never";
  const base = { interval: r.interval, end, until: r.until ? r.until.slice(0, 10) : "", count: r.count ?? 10 };
  if (simple) return { ...NO_REC, ...base, freq: r.freq as RecForm["freq"], byDay: r.byDay as Weekday[] };
  return { ...NO_REC, ...base, freq: "custom", rrule: r.rrule.replace(/;?(UNTIL|COUNT)=[^;]*/g, "").replace(/^;/, "") };
}

export function recToInput(f: RecForm, startDow: number): RecurrenceInput | null {
  if (f.freq === "none") return null;
  const tail: Pick<RecurrenceInput, "until" | "count"> = f.end === "until" && f.until ? { until: f.until } : f.end === "count" ? { count: Math.max(1, f.count) } : {};
  if (f.freq === "custom") return { freq: "custom", interval: 1, rrule: f.rrule.trim().replace(/^RRULE:/i, ""), ...tail };
  return {
    freq: f.freq,
    interval: Math.max(1, f.interval),
    ...(f.freq === "weekly" ? { byDay: f.byDay.length ? f.byDay : [dowToCode(startDow)] } : {}),
    ...tail,
  };
}

const FREQ_UNIT = { daily: ["día", "días"], weekly: ["semana", "semanas"], monthly: ["mes", "meses"], yearly: ["año", "años"] } as const;
export function describeRec(f: RecForm): string {
  if (f.freq === "none") return "No se repite";
  if (f.freq === "custom") return `Personalizada (${f.rrule || "…"})`;
  const [s, p] = FREQ_UNIT[f.freq];
  const every = f.interval === 1 ? `Cada ${s}` : `Cada ${f.interval} ${p}`;
  const days = f.freq === "weekly" && f.byDay.length ? ` (${f.byDay.map((d) => WEEKDAY_LABELS.find((w) => w.code === d)!.long.toLowerCase()).join(", ")})` : "";
  const end = f.end === "until" ? ` hasta ${f.until}` : f.end === "count" ? `, ${f.count} veces` : "";
  return `${every}${days}${end}`;
}
