import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit/audit.service";
import { db } from "@/server/db/client";
import { notifications, userSettings } from "@/server/db/schema";
import { ChannelError } from "@/server/notifications/channels/types";
import { dispatch } from "@/server/notifications/dispatch";
import { scrubSecrets } from "@/server/notifications/scrub";
import { AppError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({
  channel: z.enum(["internal", "telegram", "email"]),
  title: z.string().trim().min(1).max(200).default("Notificación de prueba"),
  message: z.string().trim().max(2000).default("Si ves esto, el canal funciona correctamente."),
});

/**
 * POST /notifications/test — envía un mensaje de prueba por el canal indicado con la configuración real.
 * Deja una fila en la bandeja (occurrence_key 'test:…') con el resultado. Sin credenciales → 422 CHANNEL_NOT_CONFIGURED.
 */
export const POST = apiHandler({ auth: "any", body, rateLimit: { limit: 10, windowSeconds: 60 } }, async (ctx) => {
  const { userId } = ctx.actor;
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const now = new Date();
  const [row] = await db
    .insert(notifications)
    .values({
      userId,
      channel: ctx.body.channel,
      targetType: "event",
      targetId: crypto.randomUUID(),
      occurrenceKey: `test:${crypto.randomUUID()}`,
      scheduledFor: now,
      nextAttemptAt: now,
      status: "processing",
      attempts: 1,
      title: ctx.body.title,
      body: ctx.body.message,
    })
    .returning();
  try {
    await dispatch(ctx.body.channel, { notificationId: row!.id, title: row!.title, body: row!.body }, settings ?? null, process.env);
    const [done] = await db
      .update(notifications)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(notifications.id, row!.id))
      .returning();
    await audit(ctx, { action: "notification.test", resourceType: "notification", resourceId: row!.id, changes: { channel: ctx.body.channel } });
    return created({ delivered: true, notification: done }, { message: "Mensaje de prueba enviado" });
  } catch (e) {
    const code = e instanceof ChannelError ? e.code : "CHANNEL_TRANSIENT";
    const msg = scrubSecrets(`${code}: ${(e as Error).message}`, [
      process.env.TELEGRAM_BOT_TOKEN,
      process.env.RESEND_API_KEY,
      settings?.telegramChatId,
    ]);
    await db.update(notifications).set({ status: "failed", lastError: msg, updatedAt: new Date() }).where(eq(notifications.id, row!.id));
    await audit(ctx, {
      action: "notification.test",
      resourceType: "notification",
      resourceId: row!.id,
      result: "failure",
      changes: { channel: ctx.body.channel, error: msg },
    });
    const status = code === "CHANNEL_NOT_CONFIGURED" ? 422 : 502;
    throw new AppError(code === "CHANNEL_NOT_CONFIGURED" ? code : "CHANNEL_DELIVERY_FAILED", status, msg, { notificationId: row!.id });
  }
});
