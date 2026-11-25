import { z } from "zod";
import { isoDate, rangeBound } from "./common";

export const agendaQuery = z.object({
  range: z.enum(["today", "tomorrow", "yesterday", "week", "next_week", "date", "custom"]).default("today"),
  /** Con range=date: día local. */
  date: isoDate.optional(),
  /** Con range=custom. */
  from: rangeBound.optional(),
  to: rangeBound.optional(),
  includeTasks: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
});

export const agendaItemOut = z.object({
  type: z.enum(["event", "task", "special_date"]),
  id: z.string(),
  occurrenceKey: z.string().nullable(),
  title: z.string(),
  start: z.string().nullable().describe("ISO con offset"),
  end: z.string().nullable(),
  localDate: z.string(),
  localTime: z.string().nullable(),
  endLocalTime: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  isAllDay: z.boolean(),
  status: z.string().nullable(),
  location: z.string().nullable(),
  categoryName: z.string().nullable(),
  color: z.string().nullable(),
  extra: z.record(z.string(), z.unknown()),
});

export const agendaOut = z.object({
  range: z.object({
    kind: z.string(),
    timezone: z.string(),
    from: z.string(),
    to: z.string(),
    localFrom: z.string(),
    localTo: z.string().describe("Último día local incluido"),
  }),
  days: z.array(
    z.object({
      localDate: z.string(),
      weekday: z.string(),
      items: z.array(agendaItemOut),
    }),
  ),
  summary: z.object({
    events: z.number().int(),
    tasks: z.number().int(),
    specialDates: z.number().int(),
    busyMinutes: z.number().int(),
    firstEventStart: z.string().nullable(),
    lastEventEnd: z.string().nullable(),
  }),
});

export const dashboardOut = z.object({
  generatedAt: z.string(),
  timezone: z.string(),
  today: z.object({ localDate: z.string(), weekday: z.string() }),
  todayAgenda: z.array(agendaItemOut),
  nextEvent: agendaItemOut.nullable(),
  upcomingEvents: z.array(agendaItemOut),
  tasks: z.object({
    pending: z.number().int(),
    inProgress: z.number().int(),
    overdue: z.number().int(),
    dueToday: z.number().int(),
    completedThisWeek: z.number().int(),
    overdueList: z.array(agendaItemOut),
    dueSoon: z.array(agendaItemOut),
  }),
  upcomingSpecialDates: z.array(agendaItemOut),
  nextBirthday: agendaItemOut.nullable(),
  freeSlotsToday: z.array(z.object({ start: z.string(), end: z.string(), durationMinutes: z.number().int() })),
  counts: z.object({ eventsThisWeek: z.number().int(), eventsToday: z.number().int() }),
});
