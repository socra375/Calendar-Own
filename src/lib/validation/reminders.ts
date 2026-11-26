import { z } from "zod";
import { pageQuery, queryBool, uuid } from "./common";

export const REMINDER_TARGETS = ["event", "task", "special_date"] as const;
export const CHANNELS = ["internal", "telegram", "email"] as const;

export const reminderCreateBody = z.object({
  targetType: z.enum(REMINDER_TARGETS),
  targetId: uuid,
  offsetMinutes: z.number().int().min(0).max(60 * 24 * 365).describe("Minutos ANTES del inicio/vencimiento"),
  channel: z.enum(CHANNELS).default("internal"),
  isActive: z.boolean().default(true),
});
export const reminderUpdateBody = z
  .object({
    offsetMinutes: z.number().int().min(0).max(60 * 24 * 365),
    channel: z.enum(CHANNELS),
    isActive: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo");
export const reminderListQuery = pageQuery.extend({
  targetType: z.enum(REMINDER_TARGETS).optional(),
  targetId: uuid.optional(),
  active: queryBool.optional(),
});
export const reminderOut = z.object({
  id: uuid,
  targetType: z.enum(REMINDER_TARGETS),
  targetId: uuid,
  offsetMinutes: z.number().int(),
  channel: z.enum(CHANNELS),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
