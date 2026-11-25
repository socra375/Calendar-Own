import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit/audit.service";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { NotFoundError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** PATCH /notifications/:id — marca como leída (por defecto) o no leída. */
export const PATCH = apiHandler(
  {
    auth: "any",
    params: z.object({ id: z.uuid() }),
    body: z.object({ read: z.boolean().default(true) }).default({ read: true }),
  },
  async (ctx) => {
    const now = new Date();
    const [row] = await db
      .update(notifications)
      .set({ readAt: ctx.body.read ? now : null, updatedAt: now })
      .where(and(eq(notifications.id, ctx.params.id), eq(notifications.userId, ctx.actor.userId)))
      .returning();
    if (!row) throw new NotFoundError("Notificación no encontrada");
    await audit(ctx, { action: ctx.body.read ? "notification.read" : "notification.unread", resourceType: "notification", resourceId: row.id });
    return ok(row);
  },
);
