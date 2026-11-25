import "server-only";
import { desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { auditLogs } from "../db/schema";
import { resolveBound } from "../domain/format";
import { andAll, countSql, getSettings, like, offsetOf, type ServiceCtx } from "./common";

export async function listAuditLogs(
  ctx: ServiceCtx,
  q: { page: number; pageSize: number; from?: string; to?: string; action?: string; resourceType?: string; resourceId?: string; actorType?: "user" | "eddie" | "system"; result?: "success" | "failure"; q?: string },
) {
  const userId = ctx.actor.userId;
  const tz = (await getSettings(userId)).timezone;
  const where = andAll([
    eq(auditLogs.userId, userId),
    q.from ? gte(auditLogs.createdAt, resolveBound(q.from, tz, "from")) : undefined,
    q.to ? lt(auditLogs.createdAt, resolveBound(q.to, tz, "to")) : undefined,
    q.action ? (q.action.endsWith("*") ? sql`${auditLogs.action} like ${q.action.slice(0, -1).replace(/[\\%_]/g, (c) => `\\${c}`) + "%"}` : eq(auditLogs.action, q.action)) : undefined,
    q.resourceType ? eq(auditLogs.resourceType, q.resourceType) : undefined,
    q.resourceId ? eq(auditLogs.resourceId, q.resourceId) : undefined,
    q.actorType ? eq(auditLogs.actorType, q.actorType) : undefined,
    q.result ? eq(auditLogs.result, q.result) : undefined,
    q.q ? sql`(${auditLogs.action} ilike ${like(q.q)} or ${auditLogs.resourceId} ilike ${like(q.q)} or ${auditLogs.changes}::text ilike ${like(q.q)})` : undefined,
  ]);
  const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(auditLogs).where(where);
  const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(q.pageSize).offset(offsetOf(q.page, q.pageSize));
  return {
    items: rows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      apiTokenId: r.apiTokenId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      requestId: r.requestId,
      result: r.result,
      changes: r.changes,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
  };
}
