import "server-only";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { settingsUpdateBody } from "@/lib/validation/settings";
import { audit } from "../audit/audit.service";
import { db } from "../db/client";
import { userSettings } from "../db/schema";
import { diff, getSettingsRow, type ServiceCtx } from "./common";

type Row = typeof userSettings.$inferSelect;

export const settingsDto = (r: Row) => ({
  displayName: r.displayName,
  timezone: r.timezone,
  theme: r.theme,
  weekStartsOn: r.weekStartsOn,
  workDayStart: r.workDayStart.slice(0, 5),
  workDayEnd: r.workDayEnd.slice(0, 5),
  workDays: r.workDays,
  defaultReminders: r.defaultReminders,
  telegramEnabled: r.telegramEnabled,
  telegramChatId: r.telegramChatId,
  emailEnabled: r.emailEnabled,
  notificationEmail: r.notificationEmail,
  updatedAt: r.updatedAt.toISOString(),
});

export async function getUserSettings(ctx: ServiceCtx) {
  return settingsDto(await getSettingsRow(ctx.actor.userId));
}

export async function updateUserSettings(ctx: ServiceCtx, patch: z.infer<typeof settingsUpdateBody>) {
  const before = await getSettingsRow(ctx.actor.userId);
  const [r] = await db
    .update(userSettings)
    .set({ ...patch, ...(patch.workDays && { workDays: [...patch.workDays].sort() }), updatedAt: new Date() })
    .where(eq(userSettings.userId, ctx.actor.userId))
    .returning();
  await audit(ctx, { action: "settings.update", resourceType: "settings", resourceId: ctx.actor.userId, changes: diff(before as never, patch as never) });
  return settingsDto(r!);
}
