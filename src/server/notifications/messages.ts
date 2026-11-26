import { utcToLocalParts } from "../domain/time";

export function humanOffset(minutes: number): string {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return d === 1 ? "1 día" : `${d} días`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hora" : `${h} horas`;
  }
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function formatLocal(d: Date, tz: string, withTime = true): string {
  const p = utcToLocalParts(d, tz);
  const date = `${pad(p.day)}/${pad(p.month)}/${p.year}`;
  return withTime ? `${date} ${pad(p.hour)}:${pad(p.minute)}` : date;
}

export type MessageKind = "event" | "task" | "special_date";

export function buildMessage(
  kind: MessageKind,
  title: string,
  offsetMinutes: number,
  reference: Date,
  tz: string,
  opts: { allDay?: boolean; location?: string | null } = {},
): { title: string; body: string } {
  const when = formatLocal(reference, tz, !opts.allDay && kind !== "special_date");
  let body: string;
  if (kind === "event") {
    body = offsetMinutes === 0 ? `Empieza ahora (${when})` : `Empieza en ${humanOffset(offsetMinutes)} (${when})`;
    if (opts.location) body += `\nLugar: ${opts.location}`;
  } else if (kind === "task") {
    body = offsetMinutes === 0 ? `Vence ahora (${when})` : `Vence en ${humanOffset(offsetMinutes)} (${when})`;
  } else {
    body = offsetMinutes === 0 ? `Es hoy (${when})` : `Faltan ${humanOffset(offsetMinutes)} (${when})`;
  }
  return { title: `Recordatorio: ${title}`, body };
}
