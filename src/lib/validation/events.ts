import { z } from "zod";
import {
  csv,
  hexColor,
  ianaTimezone,
  isoDate,
  isoDateTime,
  pageQuery,
  queryBool,
  rangeBound,
  uuid,
} from "./common";

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const EVENT_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
export const MEETING_PROVIDERS = ["google_meet", "zoom", "teams", "other"] as const;
export const SCOPES = ["all", "this", "following"] as const;

export const recurrenceInput = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]),
    interval: z.number().int().min(1).max(999).default(1),
    byDay: z.array(z.enum(WEEKDAYS)).min(1).max(7).optional(),
    /** Fin de la serie: fecha local inclusiva 'YYYY-MM-DD' (o instante ISO). Excluyente con count. */
    until: z.union([isoDate, isoDateTime]).optional(),
    count: z.number().int().min(1).max(1000).optional(),
    /** Solo para freq=custom: parte RRULE sin DTSTART (p. ej. 'FREQ=MONTHLY;BYDAY=1MO'). */
    rrule: z.string().min(5).max(500).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.freq === "custom" && !r.rrule) ctx.addIssue({ code: "custom", path: ["rrule"], message: "freq=custom requiere rrule" });
    if (r.freq !== "custom" && r.rrule) ctx.addIssue({ code: "custom", path: ["rrule"], message: "rrule solo se permite con freq=custom" });
    if (r.until && r.count) ctx.addIssue({ code: "custom", path: ["until"], message: "until y count son excluyentes" });
    if (r.byDay && r.freq !== "weekly" && r.freq !== "custom")
      ctx.addIssue({ code: "custom", path: ["byDay"], message: "byDay solo aplica a freq=weekly" });
  });
export type RecurrenceInput = z.infer<typeof recurrenceInput>;

const reminderInput = z.object({
  offsetMinutes: z.number().int().min(0).max(60 * 24 * 365),
  channel: z.enum(["internal", "telegram", "email"]).default("internal"),
});

const eventFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable(),
  notes: z.string().max(10_000).nullable(),
  isAllDay: z.boolean(),
  /** Instantes ISO con offset (eventos con hora). */
  startAt: isoDateTime,
  endAt: isoDateTime,
  durationMinutes: z.number().int().min(0).max(60 * 24 * 31),
  /** Eventos de día completo: fechas locales; endDate es EXCLUSIVO (si falta = startDate + 1 día). */
  startDate: isoDate,
  endDate: isoDate,
  timezone: ianaTimezone,
  categoryId: uuid.nullable(),
  color: hexColor.nullable(),
  location: z.string().max(500).nullable(),
  meetingUrl: z.url().max(2000).nullable(),
  meetingProvider: z.enum(MEETING_PROVIDERS).nullable(),
  status: z.enum(EVENT_STATUSES),
  isBlocking: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30),
};

export const eventCreateBody = z
  .object({
    title: eventFields.title,
    description: eventFields.description.optional(),
    notes: eventFields.notes.optional(),
    isAllDay: eventFields.isAllDay.default(false),
    startAt: eventFields.startAt.optional(),
    endAt: eventFields.endAt.optional(),
    durationMinutes: eventFields.durationMinutes.optional(),
    startDate: eventFields.startDate.optional(),
    endDate: eventFields.endDate.optional(),
    timezone: eventFields.timezone.optional(),
    categoryId: eventFields.categoryId.optional(),
    color: eventFields.color.optional(),
    location: eventFields.location.optional(),
    meetingUrl: eventFields.meetingUrl.optional(),
    meetingProvider: eventFields.meetingProvider.optional(),
    status: eventFields.status.default("confirmed"),
    isBlocking: eventFields.isBlocking.default(false),
    tags: eventFields.tags.optional(),
    recurrence: recurrenceInput.nullable().optional(),
    reminders: z.array(reminderInput).max(10).optional(),
    /** Ignorar conflictos bloqueantes. */
    force: z.boolean().default(false),
  })
  .superRefine((e, ctx) => {
    if (e.isAllDay) {
      if (!e.startDate) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Requerido para eventos de día completo" });
      if (e.startDate && e.endDate && e.endDate <= e.startDate)
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate (exclusivo) debe ser posterior a startDate" });
    } else {
      if (!e.startAt) ctx.addIssue({ code: "custom", path: ["startAt"], message: "Requerido para eventos con hora" });
      if (e.startAt && e.endAt && Date.parse(e.endAt) < Date.parse(e.startAt))
        ctx.addIssue({ code: "custom", path: ["endAt"], message: "endAt no puede ser anterior a startAt" });
      if (e.endAt && e.durationMinutes !== undefined)
        ctx.addIssue({ code: "custom", path: ["durationMinutes"], message: "Usa endAt o durationMinutes, no ambos" });
    }
  });
export type EventCreateBody = z.infer<typeof eventCreateBody>;

export const eventUpdateBody = z
  .object({
    title: eventFields.title,
    description: eventFields.description,
    notes: eventFields.notes,
    isAllDay: eventFields.isAllDay,
    startAt: eventFields.startAt,
    endAt: eventFields.endAt,
    durationMinutes: eventFields.durationMinutes,
    startDate: eventFields.startDate,
    endDate: eventFields.endDate,
    timezone: eventFields.timezone,
    categoryId: eventFields.categoryId,
    color: eventFields.color,
    location: eventFields.location,
    meetingUrl: eventFields.meetingUrl,
    meetingProvider: eventFields.meetingProvider,
    status: eventFields.status,
    isBlocking: eventFields.isBlocking,
    tags: eventFields.tags,
    /** null = quitar recurrencia (solo scope=all). */
    recurrence: recurrenceInput.nullable(),
    force: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo");
export type EventUpdateBody = z.infer<typeof eventUpdateBody>;

export const scopeQuery = z.object({
  scope: z.enum(SCOPES).default("all"),
  occurrenceKey: z.string().min(8).max(40).optional(),
});

export const eventDuplicateBody = z
  .object({
    title: eventFields.title,
    startAt: eventFields.startAt,
    endAt: eventFields.endAt,
    startDate: eventFields.startDate,
    endDate: eventFields.endDate,
    force: z.boolean(),
  })
  .partial()
  .default({});

export const eventListQuery = pageQuery.extend({
  q: z.string().trim().max(200).optional(),
  categoryId: uuid.optional(),
  tag: z.string().trim().max(50).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  from: rangeBound.optional(),
  to: rangeBound.optional(),
  sort: z.enum(["start", "-start", "title", "-title", "created", "-created"]).default("start"),
  /** true = lista la papelera (borrados suaves). */
  deleted: queryBool.optional(),
});
export type EventListQuery = z.infer<typeof eventListQuery>;

export const bulkDeleteQuery = z.object({ ids: csv(uuid).refine((a) => a.length >= 1, "ids requerido") });

// ---------- Disponibilidad ----------
export const availabilityQuery = z.object({ from: rangeBound, to: rangeBound });
export const freeSlotsQuery = z.object({
  from: rangeBound,
  to: rangeBound,
  durationMinutes: z.coerce.number().int().min(5).max(24 * 60).default(30),
  withinWorkingHours: queryBool.default(true),
});

// ---------- Salida ----------
export const eventOut = z.object({
  id: uuid,
  title: z.string(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  isAllDay: z.boolean(),
  startAt: z.string().nullable().describe("ISO con offset de la zona del evento (null si día completo)"),
  endAt: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable().describe("Exclusivo"),
  timezone: z.string(),
  localDate: z.string().describe("YYYY-MM-DD de inicio en la zona del evento"),
  localTime: z.string().nullable().describe("HH:mm de inicio (null si día completo)"),
  endLocalDate: z.string().describe("Último día local (día completo: último día incluido)"),
  endLocalTime: z.string().nullable(),
  durationMinutes: z.number().int(),
  categoryId: uuid.nullable(),
  category: z.object({ id: uuid, name: z.string(), color: z.string() }).nullable(),
  color: z.string().nullable(),
  location: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  meetingProvider: z.enum(MEETING_PROVIDERS).nullable(),
  status: z.enum(EVENT_STATUSES),
  isBlocking: z.boolean(),
  source: z.enum(["ui", "eddie", "system"]),
  tags: z.array(z.object({ id: uuid, name: z.string(), color: z.string().nullable() })),
  isRecurring: z.boolean(),
  recurrence: z
    .object({
      rrule: z.string(),
      freq: z.string().nullable(),
      interval: z.number().int(),
      byDay: z.array(z.string()),
      until: z.string().nullable(),
      count: z.number().int().nullable(),
      seriesEndAt: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export const occurrenceOut = eventOut.extend({
  seriesId: uuid.nullable(),
  occurrenceKey: z.string().describe("Instante UTC ISO (con hora) o YYYY-MM-DD (día completo)"),
  isException: z.boolean(),
});

export const freeSlotOut = z.object({
  start: z.string(),
  end: z.string(),
  localDate: z.string(),
  localStartTime: z.string(),
  localEndTime: z.string(),
  durationMinutes: z.number().int(),
});
export const busyOut = z.object({
  start: z.string(),
  end: z.string(),
  durationMinutes: z.number().int(),
  eventIds: z.array(z.string()),
});
