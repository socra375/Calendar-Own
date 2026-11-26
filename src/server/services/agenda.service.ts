import "server-only";
import { z } from "zod";
import type { agendaItemOut, agendaQuery } from "@/lib/validation/agenda";
import { clipBusy, mergeBusy, occurrenceToBusy, type BusyItem } from "../domain/availability";
import { resolveRange, toIso, weekdayName } from "../domain/format";
import { daysBetween, occurrencesBetween, yearsSince } from "../domain/special-dates";
import { addLocalDays, localDayRange, localToUtc, relativeRange, toLocalDate } from "../domain/time";
import { freeSlotsRaw } from "./availability.service";
import { getSettings, type ServiceCtx } from "./common";
import { assertRange, fetchOccurrences, type OccurrenceDto, occurrencesToDtos } from "./events.service";
import { activeSpecialDates, specialDateDto } from "./special-dates.service";
import { overdueTasks, taskStats, tasksDueBetween, type TaskDto } from "./tasks.service";
import { ValidationError } from "../http/errors";

export type AgendaItem = z.infer<typeof agendaItemOut>;

export function eventItem(o: OccurrenceDto): AgendaItem {
  return {
    type: "event",
    id: o.id,
    occurrenceKey: o.occurrenceKey,
    title: o.title,
    start: o.isAllDay ? null : o.startAt,
    end: o.isAllDay ? null : o.endAt,
    localDate: o.localDate,
    localTime: o.localTime,
    endLocalTime: o.endLocalTime,
    durationMinutes: o.durationMinutes,
    isAllDay: o.isAllDay,
    status: o.status,
    location: o.location,
    categoryName: o.category?.name ?? null,
    color: o.color ?? o.category?.color ?? null,
    extra: {
      startDate: o.startDate,
      endDate: o.endDate,
      endLocalDate: o.endLocalDate,
      isBlocking: o.isBlocking,
      isRecurring: o.isRecurring,
      isException: o.isException,
      meetingUrl: o.meetingUrl,
      tags: o.tags.map((t) => t.name),
      timezone: o.timezone,
    },
  };
}

export function taskItem(t: TaskDto): AgendaItem {
  return {
    type: "task",
    id: t.id,
    occurrenceKey: null,
    title: t.title,
    start: t.dueAt,
    end: null,
    localDate: t.dueLocalDate ?? "",
    localTime: t.dueLocalTime,
    endLocalTime: null,
    durationMinutes: null,
    isAllDay: false,
    status: t.status,
    location: null,
    categoryName: t.category?.name ?? null,
    color: t.category?.color ?? null,
    extra: { priority: t.priority, isOverdue: t.isOverdue, eventId: t.eventId, tags: t.tags.map((x) => x.name) },
  };
}

export function specialDateItem(d: ReturnType<typeof specialDateDto>, occurrenceDate: string, tz: string): AgendaItem {
  return {
    type: "special_date",
    id: d.id,
    occurrenceKey: occurrenceDate,
    title: d.title,
    start: toIso(localToUtc(occurrenceDate, tz), tz),
    end: null,
    localDate: occurrenceDate,
    localTime: null,
    endLocalTime: null,
    durationMinutes: null,
    isAllDay: true,
    status: null,
    location: null,
    categoryName: null,
    color: d.color,
    extra: {
      specialType: d.type,
      recursYearly: d.recursYearly,
      yearsSince: d.recursYearly ? yearsSince(d.date, occurrenceDate) : null,
      icon: d.icon,
      originDate: d.date,
    },
  };
}

const rank = (i: AgendaItem) => (i.type === "special_date" ? 0 : i.isAllDay ? 1 : 2);
const sortItems = (a: AgendaItem, b: AgendaItem) => rank(a) - rank(b) || (a.start ?? "").localeCompare(b.start ?? "") || a.title.localeCompare(b.title);

/** Últimos días locales cubiertos por [start,end) (un evento que termina a las 00:00 no invade el día siguiente). */
function coveredDays(first: string, lastIncl: string, from: string, to: string): string[] {
  const out: string[] = [];
  let d = first < from ? from : first;
  const end = lastIncl > to ? to : lastIncl;
  for (let g = 0; d <= end && g < 800; g++) {
    out.push(d);
    d = addLocalDays(d, 1);
  }
  return out;
}

export async function getAgenda(ctx: ServiceCtx, q: z.infer<typeof agendaQuery>, now = new Date()) {
  const userId = ctx.actor.userId;
  const s = await getSettings(userId);
  const tz = s.timezone;
  let from: Date;
  let to: Date;
  if (q.range === "date") {
    if (!q.date) throw new ValidationError("range=date requiere `date`", [{ path: "date", code: "required", message: "Requerido" }]);
    ({ from, to } = localDayRange(q.date, tz));
  } else if (q.range === "custom") {
    if (!q.from || !q.to) throw new ValidationError("range=custom requiere `from` y `to`");
    ({ from, to } = resolveRange(q.from, q.to, tz));
  } else {
    ({ from, to } = relativeRange(q.range, tz, now, s.weekStartsOn));
  }
  assertRange({ from, to });
  const localFrom = toLocalDate(from, tz);
  const localTo = toLocalDate(new Date(to.getTime() - 1), tz);

  const [occ, tasks] = await Promise.all([
    fetchOccurrences(userId, from, to, {}, tz),
    q.includeTasks ? tasksDueBetween(userId, from, to, ["pending", "in_progress", "completed"], tz) : Promise.resolve([] as TaskDto[]),
  ]);
  const evDtos = await occurrencesToDtos(occ.items.filter((i) => i.occ.status !== "cancelled"));
  const dates = await activeSpecialDates(userId);

  const perDay = new Map<string, AgendaItem[]>();
  const push = (day: string, it: AgendaItem) => perDay.set(day, [...(perDay.get(day) ?? []), it]);
  for (const o of evDtos) {
    const item = eventItem(o);
    const last = o.isAllDay ? o.endLocalDate : (o.durationMinutes ? toLocalDate(new Date(new Date(o.endAt!).getTime() - 1), tz) : o.localDate);
    for (const day of coveredDays(o.localDate, last < o.localDate ? o.localDate : last, localFrom, localTo)) push(day, item);
  }
  for (const t of tasks) if (t.dueLocalDate) push(t.dueLocalDate, taskItem(t));
  let sdCount = 0;
  const today = toLocalDate(now, tz);
  for (const d of dates) {
    for (const occDate of occurrencesBetween(d.date, d.recursYearly, localFrom, localTo)) {
      sdCount++;
      push(occDate, specialDateItem(specialDateDto(d, today), occDate, tz));
    }
  }

  const days: { localDate: string; weekday: string; items: AgendaItem[] }[] = [];
  for (let day = localFrom, g = 0; day <= localTo && g < 800; day = addLocalDays(day, 1), g++)
    days.push({ localDate: day, weekday: weekdayName(day), items: (perDay.get(day) ?? []).sort(sortItems) });

  const timed = evDtos.filter((e) => !e.isAllDay);
  const busyItems = occ.items.map((i) => occurrenceToBusy(i.occ)).filter((b): b is BusyItem => b !== null);
  const busyMinutes = Math.round(clipBusy(mergeBusy(busyItems), from, to).reduce((acc, b) => acc + (b.end.getTime() - b.start.getTime()), 0) / 60_000);
  return {
    range: { kind: q.range, timezone: tz, from: toIso(from, tz), to: toIso(to, tz), localFrom, localTo },
    days,
    summary: {
      events: evDtos.length,
      tasks: tasks.length,
      specialDates: sdCount,
      busyMinutes,
      firstEventStart: timed[0]?.startAt ?? null,
      lastEventEnd: timed.length ? timed.reduce((m, e) => (new Date(e.endAt!) > new Date(m) ? e.endAt! : m), timed[0]!.endAt!) : null,
    },
    truncated: occ.truncated,
  };
}

export async function getDashboard(ctx: ServiceCtx, now = new Date()) {
  const userId = ctx.actor.userId;
  const s = await getSettings(userId);
  const tz = s.timezone;
  const today = toLocalDate(now, tz);
  const todayR = relativeRange("today", tz, now);
  const weekR = relativeRange("week", tz, now, s.weekStartsOn);
  const horizon = new Date(now.getTime() + 14 * 86_400_000);

  const [todayOcc, weekOcc, upcomingOcc, stats, overdue, dueSoonTasks, dates, free] = await Promise.all([
    fetchOccurrences(userId, todayR.from, todayR.to, {}, tz),
    fetchOccurrences(userId, weekR.from, weekR.to, {}, tz),
    fetchOccurrences(userId, now, horizon, {}, tz),
    taskStats(userId, now, todayR.from, todayR.to, weekR.from, weekR.to),
    overdueTasks(userId, now, tz, 10),
    tasksDueBetween(userId, now, new Date(now.getTime() + 7 * 86_400_000), ["pending", "in_progress"], tz, 10),
    activeSpecialDates(userId),
    freeSlotsRaw(userId, now > todayR.from ? now : todayR.from, todayR.to, 30, tz, true),
  ]);
  const live = (x: typeof todayOcc) => x.items.filter((i) => i.occ.status !== "cancelled");
  const todayEvents = (await occurrencesToDtos(live(todayOcc))).map(eventItem);
  const upcoming = (await occurrencesToDtos(live(upcomingOcc).filter((i) => i.occ.end > now))).map(eventItem);
  const nextEvent = upcoming.find((e) => !e.isAllDay && e.start && new Date(e.start) >= now) ?? null;

  const sdAll = dates.map((d) => {
    const dto = specialDateDto(d, today);
    return { dto, next: dto.nextOccurrence };
  });
  const sdUpcoming = sdAll
    .filter((x) => x.next && daysBetween(today, x.next) <= 30)
    .sort((a, b) => a.next!.localeCompare(b.next!))
    .slice(0, 10)
    .map((x) => specialDateItem(x.dto, x.next!, tz));
  const nextBday = sdAll.filter((x) => x.dto.type === "birthday" && x.next).sort((a, b) => a.next!.localeCompare(b.next!))[0];

  return {
    generatedAt: toIso(now, tz),
    timezone: tz,
    today: { localDate: today, weekday: weekdayName(today) },
    todayAgenda: [...todayEvents, ...(await tasksDueBetween(userId, todayR.from, todayR.to, ["pending", "in_progress"], tz)).map(taskItem)].sort(sortItems),
    nextEvent,
    upcomingEvents: upcoming.slice(0, 10),
    tasks: {
      pending: stats.pending,
      inProgress: stats.inProgress,
      overdue: stats.overdue,
      dueToday: stats.dueToday,
      completedThisWeek: stats.completedThisWeek,
      overdueList: overdue.map(taskItem),
      dueSoon: dueSoonTasks.map(taskItem),
    },
    upcomingSpecialDates: sdUpcoming,
    nextBirthday: nextBday ? specialDateItem(nextBday.dto, nextBday.next!, tz) : null,
    freeSlotsToday: free.map((f) => ({ start: toIso(f.start, tz), end: toIso(f.end, tz), durationMinutes: f.durationMinutes })),
    counts: { eventsToday: live(todayOcc).length, eventsThisWeek: live(weekOcc).length },
  };
}

