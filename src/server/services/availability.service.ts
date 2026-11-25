import "server-only";
import { clipBusy, computeFreeSlots, mergeBusy, occurrenceToBusy, workingWindowsBetween, type BusyItem } from "../domain/availability";
import { localTime, resolveRange, toIso } from "../domain/format";
import { toLocalDate } from "../domain/time";
import { getSettings, type ServiceCtx } from "./common";
import { assertRange, fetchOccurrences, occurrencesToDtos } from "./events.service";

async function busyFor(userId: string, from: Date, to: Date, tz: string) {
  const { items, truncated } = await fetchOccurrences(userId, from, to, {}, tz);
  const busyItems: BusyItem[] = [];
  const blocking = items.filter((i) => {
    const b = occurrenceToBusy(i.occ);
    if (b) busyItems.push(b);
    return Boolean(b);
  });
  return { merged: clipBusy(mergeBusy(busyItems), from, to), blocking, truncated };
}

export async function getAvailability(ctx: ServiceCtx, q: { from: string; to: string }) {
  const userId = ctx.actor.userId;
  const s = await getSettings(userId);
  const range = resolveRange(q.from, q.to, s.timezone);
  assertRange(range);
  const { merged, blocking, truncated } = await busyFor(userId, range.from, range.to, s.timezone);
  return {
    range: { from: toIso(range.from, s.timezone), to: toIso(range.to, s.timezone), timezone: s.timezone },
    busy: merged.map((b) => ({
      start: toIso(b.start, s.timezone),
      end: toIso(b.end, s.timezone),
      durationMinutes: Math.round((b.end.getTime() - b.start.getTime()) / 60_000),
      eventIds: b.eventIds,
    })),
    events: await occurrencesToDtos(blocking),
    truncated,
  };
}

export async function getFreeSlots(ctx: ServiceCtx, q: { from: string; to: string; durationMinutes: number; withinWorkingHours: boolean }) {
  const userId = ctx.actor.userId;
  const s = await getSettings(userId);
  const range = resolveRange(q.from, q.to, s.timezone);
  assertRange(range);
  const { merged } = await busyFor(userId, range.from, range.to, s.timezone);
  const windows = q.withinWorkingHours ? workingWindowsBetween(range.from, range.to, s.timezone, s) : undefined;
  const slots = computeFreeSlots({ from: range.from, to: range.to, busy: merged, durationMinutes: q.durationMinutes, windows });
  return {
    range: { from: toIso(range.from, s.timezone), to: toIso(range.to, s.timezone), timezone: s.timezone },
    durationMinutes: q.durationMinutes,
    withinWorkingHours: q.withinWorkingHours,
    slots: slots.map((x) => ({
      start: toIso(x.start, s.timezone),
      end: toIso(x.end, s.timezone),
      localDate: toLocalDate(x.start, s.timezone),
      localStartTime: localTime(x.start, s.timezone),
      localEndTime: localTime(x.end, s.timezone),
      durationMinutes: x.durationMinutes,
    })),
  };
}

/** Huecos libres crudos para dashboard (sin DTO). */
export async function freeSlotsRaw(userId: string, from: Date, to: Date, durationMinutes: number, tz: string, working: boolean) {
  const s = await getSettings(userId);
  const { merged } = await busyFor(userId, from, to, tz);
  const windows = working ? workingWindowsBetween(from, to, tz, s) : undefined;
  return computeFreeSlots({ from, to, busy: merged, durationMinutes, windows });
}
