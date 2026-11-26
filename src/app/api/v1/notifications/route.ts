import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { notificationListQuery } from "@/lib/validation/notifications";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { paginated } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: notificationListQuery }, async ({ actor, query }) => {
  const where = and(
    eq(notifications.userId, actor.userId),
    query.status ? eq(notifications.status, query.status) : undefined,
    query.channel ? eq(notifications.channel, query.channel) : undefined,
    query.unread === true ? isNull(notifications.readAt) : undefined,
    query.unread === false ? sql`${notifications.readAt} is not null` : undefined,
    query.from ? gte(notifications.scheduledFor, query.from) : undefined,
    query.to ? lte(notifications.scheduledFor, query.to) : undefined,
  );
  // `meta.unreadCount`: no leídas de la bandeja interna (canal internal) del usuario, independiente de los filtros de
  // la consulta; es un único COUNT, así la campana no necesita pedir una página de datos para contar.
  const unreadWhere = and(eq(notifications.userId, actor.userId), eq(notifications.channel, "internal"), eq(notifications.status, "sent"), isNull(notifications.readAt));
  const [[{ total } = { total: 0 }], [{ unread } = { unread: 0 }], items] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(where),
    db.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(unreadWhere),
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.scheduledFor), desc(notifications.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);
  return paginated(items, { page: query.page, pageSize: query.pageSize, total }, { meta: { unreadCount: unread } });
});
