import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { audit } from "../audit/audit.service";
import { db } from "../db/client";
import { events, reminders, specialDates, tasks } from "../db/schema";
import { NotFoundError, ValidationError } from "../http/errors";
import { andAll, countSql, diff, offsetOf, type ServiceCtx } from "./common";

type Row = typeof reminders.$inferSelect;
type Channel = Row["channel"];
type Target = Row["targetType"];

export const reminderDto = (r: Row) => ({
  id: r.id,
  targetType: r.targetType,
  targetId: (r.eventId ?? r.taskId ?? r.specialDateId)!,
  offsetMinutes: r.offsetMinutes,
  channel: r.channel,
  isActive: r.isActive,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

async function assertTarget(userId: string, type: Target, id: string) {
  const t = type === "event" ? events : type === "task" ? tasks : specialDates;
  const [row] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.userId, userId), isNull(t.deletedAt))).limit(1);
  if (!row) throw new ValidationError("Destino del recordatorio inexistente", [{ path: "targetId", code: "invalid_reference", message: `${type} no encontrado` }]);
}

export async function listReminders(ctx: ServiceCtx, q: { page: number; pageSize: number; targetType?: Target; targetId?: string; active?: boolean }) {
  const where = andAll([
    eq(reminders.userId, ctx.actor.userId),
    q.targetType ? eq(reminders.targetType, q.targetType) : undefined,
    q.targetId ? (q.targetType === "task" ? eq(reminders.taskId, q.targetId) : q.targetType === "special_date" ? eq(reminders.specialDateId, q.targetId) : eq(reminders.eventId, q.targetId)) : undefined,
    q.active !== undefined ? eq(reminders.isActive, q.active) : undefined,
  ]);
  const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(reminders).where(where);
  const rows = await db.select().from(reminders).where(where).orderBy(asc(reminders.createdAt), asc(reminders.id)).limit(q.pageSize).offset(offsetOf(q.page, q.pageSize));
  return { items: rows.map(reminderDto), total };
}

async function loadOwned(userId: string, id: string) {
  const [r] = await db.select().from(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId))).limit(1);
  if (!r) throw new NotFoundError("Recordatorio no encontrado");
  return r;
}

export async function getReminder(ctx: ServiceCtx, id: string) {
  return reminderDto(await loadOwned(ctx.actor.userId, id));
}

export async function createReminder(ctx: ServiceCtx, i: { targetType: Target; targetId: string; offsetMinutes: number; channel: Channel; isActive: boolean }) {
  const userId = ctx.actor.userId;
  await assertTarget(userId, i.targetType, i.targetId);
  const [r] = await db
    .insert(reminders)
    .values({
      userId, targetType: i.targetType, offsetMinutes: i.offsetMinutes, channel: i.channel, isActive: i.isActive,
      eventId: i.targetType === "event" ? i.targetId : null,
      taskId: i.targetType === "task" ? i.targetId : null,
      specialDateId: i.targetType === "special_date" ? i.targetId : null,
    })
    .returning();
  await audit(ctx, { action: "reminder.create", resourceType: "reminder", resourceId: r!.id, changes: { targetType: i.targetType, targetId: i.targetId, offsetMinutes: i.offsetMinutes, channel: i.channel } });
  return reminderDto(r!);
}

export async function updateReminder(ctx: ServiceCtx, id: string, patch: { offsetMinutes?: number; channel?: Channel; isActive?: boolean }) {
  const before = await loadOwned(ctx.actor.userId, id);
  const [r] = await db.update(reminders).set({ ...patch, updatedAt: new Date() }).where(and(eq(reminders.id, id), eq(reminders.userId, ctx.actor.userId))).returning();
  await audit(ctx, { action: "reminder.update", resourceType: "reminder", resourceId: id, changes: diff(before, patch) });
  return reminderDto(r!);
}

export async function deleteReminder(ctx: ServiceCtx, id: string) {
  await loadOwned(ctx.actor.userId, id);
  await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, ctx.actor.userId)));
  await audit(ctx, { action: "reminder.delete", resourceType: "reminder", resourceId: id });
  return { id };
}
