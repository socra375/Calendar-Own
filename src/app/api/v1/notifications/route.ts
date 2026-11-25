import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { paginated } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["pending", "processing", "sent", "failed", "cancelled"]).optional(),
  channel: z.enum(["internal", "telegram", "email"]).optional(),
  unread: bool.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const GET = apiHandler({ auth: "any", query: querySchema }, async ({ actor, query }) => {
  const where = and(
    eq(notifications.userId, actor.userId),
    query.status ? eq(notifications.status, query.status) : undefined,
    query.channel ? eq(notifications.channel, query.channel) : undefined,
    query.unread === true ? isNull(notifications.readAt) : undefined,
    query.unread === false ? sql`${notifications.readAt} is not null` : undefined,
    query.from ? gte(notifications.scheduledFor, query.from) : undefined,
    query.to ? lte(notifications.scheduledFor, query.to) : undefined,
  );
  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(where);
  const items = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.scheduledFor), desc(notifications.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  return paginated(items, { page: query.page, pageSize: query.pageSize, total });
});
