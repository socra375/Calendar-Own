import { z } from "zod";
import { CHANNELS } from "./reminders";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

export const NOTIFICATION_STATUSES = ["pending", "processing", "sent", "failed", "cancelled"] as const;

export const notificationListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  channel: z.enum(CHANNELS).optional(),
  unread: bool.optional().describe("true = solo sin leer; false = solo leídas"),
  from: z.coerce.date().optional().describe("scheduledFor >= from"),
  to: z.coerce.date().optional().describe("scheduledFor <= to"),
});

export const notificationPatchBody = z.object({ read: z.boolean().default(true) }).default({ read: true });

export const notificationTestBody = z.object({
  channel: z.enum(CHANNELS),
  title: z.string().trim().min(1).max(200).default("Notificación de prueba"),
  message: z.string().trim().max(2000).default("Si ves esto, el canal funciona correctamente."),
});

export const notificationOut = z
  .object({
    id: z.string(),
    channel: z.enum(CHANNELS),
    targetType: z.enum(["event", "task", "special_date"]),
    targetId: z.string(),
    occurrenceKey: z.string(),
    scheduledFor: z.string(),
    status: z.enum(NOTIFICATION_STATUSES),
    attempts: z.number().int(),
    lastError: z.string().nullable(),
    sentAt: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .passthrough();

export const notificationTestOut = z.object({ delivered: z.boolean(), notification: notificationOut });
