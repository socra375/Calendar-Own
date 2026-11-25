import { z } from "zod";
import { CHANNELS } from "./reminders";
import { ianaTimezone, timeOfDay } from "./common";

const f = {
  displayName: z.string().trim().max(100).nullable(),
  timezone: ianaTimezone,
  theme: z.enum(["light", "dark", "system"]),
  weekStartsOn: z.number().int().min(0).max(6),
  workDayStart: timeOfDay,
  workDayEnd: timeOfDay,
  workDays: z.array(z.number().int().min(0).max(6)).max(7).refine((a) => new Set(a).size === a.length, "Días repetidos"),
  defaultReminders: z
    .array(z.object({ offsetMinutes: z.number().int().min(0).max(60 * 24 * 365), channel: z.enum(CHANNELS) }))
    .max(10),
  telegramEnabled: z.boolean(),
  telegramChatId: z.string().trim().max(100).nullable(),
  emailEnabled: z.boolean(),
  notificationEmail: z.email().nullable(),
};

export const settingsUpdateBody = z
  .object(f)
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo");

export const settingsOut = z.object({
  displayName: f.displayName,
  timezone: z.string(),
  theme: f.theme,
  weekStartsOn: z.number().int(),
  workDayStart: z.string().describe("HH:mm"),
  workDayEnd: z.string().describe("HH:mm"),
  workDays: z.array(z.number().int()).describe("0=domingo..6=sábado"),
  defaultReminders: f.defaultReminders,
  telegramEnabled: z.boolean(),
  telegramChatId: z.string().nullable(),
  emailEnabled: z.boolean(),
  notificationEmail: z.string().nullable(),
  updatedAt: z.string(),
});
