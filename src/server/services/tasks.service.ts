import "server-only";
import { and, asc, desc, eq, exists, gte, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { TaskCreateBody, TaskListQuery, TaskUpdateBody } from "@/lib/validation/tasks";
import { audit } from "../audit/audit.service";
import { db, type DbOrTx } from "../db/client";
import { categories, events, reminders, tags, taskTags, tasks } from "../db/schema";
import { localTime, resolveBound, toIso } from "../domain/format";
import { toLocalDate } from "../domain/time";
import { NotFoundError, ValidationError } from "../http/errors";
import { andAll, countSql, diff, getSettings, like, offsetOf, sourceOf, type ServiceCtx } from "./common";
import { assertEventOwned } from "./events.service";
import { resolveTagIds } from "./tags.service";

type Row = typeof tasks.$inferSelect;

async function metaFor(rows: Row[]) {
  const ids = rows.map((r) => r.id);
  const tagMap = new Map<string, { id: string; name: string; color: string | null }[]>();
  if (ids.length) {
    const t = await db
      .select({ taskId: taskTags.taskId, id: tags.id, name: tags.name, color: tags.color })
      .from(taskTags)
      .innerJoin(tags, eq(tags.id, taskTags.tagId))
      .where(inArray(taskTags.taskId, ids))
      .orderBy(asc(sql`lower(${tags.name})`));
    for (const r of t) tagMap.set(r.taskId, [...(tagMap.get(r.taskId) ?? []), { id: r.id, name: r.name, color: r.color }]);
  }
  const catIds = [...new Set(rows.map((r) => r.categoryId).filter((x): x is string => !!x))];
  const evIds = [...new Set(rows.map((r) => r.eventId).filter((x): x is string => !!x))];
  const cats = catIds.length ? await db.select({ id: categories.id, name: categories.name, color: categories.color }).from(categories).where(inArray(categories.id, catIds)) : [];
  const evs = evIds.length ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, evIds)) : [];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const evMap = new Map(evs.map((e) => [e.id, e]));
  return { tagMap, catMap, evMap };
}

export async function tasksToDtos(rows: Row[], tz: string, now = new Date()) {
  const { tagMap, catMap, evMap } = await metaFor(rows);
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    dueAt: t.dueAt ? toIso(t.dueAt, tz) : null,
    dueLocalDate: t.dueAt ? toLocalDate(t.dueAt, tz) : null,
    dueLocalTime: t.dueAt ? localTime(t.dueAt, tz) : null,
    priority: t.priority,
    status: t.status,
    isOverdue: Boolean(t.dueAt && t.dueAt < now && (t.status === "pending" || t.status === "in_progress")),
    categoryId: t.categoryId,
    category: t.categoryId ? (catMap.get(t.categoryId) ?? null) : null,
    eventId: t.eventId,
    event: t.eventId ? (evMap.get(t.eventId) ?? null) : null,
    completedAt: t.completedAt ? toIso(t.completedAt, tz) : null,
    source: t.source,
    tags: tagMap.get(t.id) ?? [],
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt?.toISOString() ?? null,
  }));
}
export type TaskDto = Awaited<ReturnType<typeof tasksToDtos>>[number];

async function assertRefs(userId: string, categoryId?: string | null, eventId?: string | null) {
  if (categoryId) {
    const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.userId, userId), isNull(categories.deletedAt))).limit(1);
    if (!c) throw new ValidationError("Categoría inexistente", [{ path: "categoryId", code: "invalid_reference", message: "Categoría no encontrada" }]);
  }
  if (eventId) await assertEventOwned(userId, eventId);
}

const OPEN = ["pending", "in_progress"] as const;

export async function listTasks(ctx: ServiceCtx, q: TaskListQuery) {
  const userId = ctx.actor.userId;
  const tz = (await getSettings(userId)).timezone;
  const now = new Date();
  const where = andAll([
    eq(tasks.userId, userId),
    q.deleted ? isNotNull(tasks.deletedAt) : isNull(tasks.deletedAt),
    q.status?.length ? inArray(tasks.status, q.status) : undefined,
    q.priority?.length ? inArray(tasks.priority, q.priority) : undefined,
    q.categoryId ? eq(tasks.categoryId, q.categoryId) : undefined,
    q.eventId ? eq(tasks.eventId, q.eventId) : undefined,
    q.q ? sql`(${tasks.title} ilike ${like(q.q)} or ${tasks.description} ilike ${like(q.q)})` : undefined,
    q.tag
      ? exists(
          db.select({ one: sql`1` }).from(taskTags).innerJoin(tags, eq(tags.id, taskTags.tagId))
            .where(and(eq(taskTags.taskId, tasks.id), eq(tags.userId, userId), sql`lower(${tags.name}) = lower(${q.tag})`)),
        )
      : undefined,
    q.from ? gte(tasks.dueAt, resolveBound(q.from, tz, "from")) : undefined,
    q.to ? lt(tasks.dueAt, resolveBound(q.to, tz, "to")) : undefined,
    q.overdue ? and(inArray(tasks.status, [...OPEN]), lt(tasks.dueAt, now)) : undefined,
  ]);
  const order: SQL[] = {
    due: [sql`${tasks.dueAt} asc nulls last`],
    "-due": [sql`${tasks.dueAt} desc nulls last`],
    priority: [desc(tasks.priority), sql`${tasks.dueAt} asc nulls last`],
    "-priority": [asc(tasks.priority), sql`${tasks.dueAt} asc nulls last`],
    created: [asc(tasks.createdAt)],
    "-created": [desc(tasks.createdAt)],
    title: [asc(sql`lower(${tasks.title})`)],
    "-title": [desc(sql`lower(${tasks.title})`)],
  }[q.sort];
  const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(tasks).where(where);
  const rows = await db.select().from(tasks).where(where).orderBy(...order, asc(tasks.createdAt), asc(tasks.id)).limit(q.pageSize).offset(offsetOf(q.page, q.pageSize));
  return { items: await tasksToDtos(rows, tz, now), total };
}

async function loadOwned(userId: string, id: string, deleted = false) {
  const [row] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId), deleted ? isNotNull(tasks.deletedAt) : isNull(tasks.deletedAt))).limit(1);
  if (!row) throw new NotFoundError("Tarea no encontrada");
  return row;
}

async function dtoOf(userId: string, row: Row) {
  const tz = (await getSettings(userId)).timezone;
  return (await tasksToDtos([row], tz))[0]!;
}

export async function getTask(ctx: ServiceCtx, id: string) {
  const row = await loadOwned(ctx.actor.userId, id);
  const dto = await dtoOf(ctx.actor.userId, row);
  const rem = await db.select().from(reminders).where(eq(reminders.taskId, id));
  return { ...dto, reminders: rem.map((r) => ({ id: r.id, offsetMinutes: r.offsetMinutes, channel: r.channel, isActive: r.isActive })) };
}

async function setTags(tx: DbOrTx, userId: string, taskId: string, names: string[]) {
  await tx.delete(taskTags).where(eq(taskTags.taskId, taskId));
  const ids = await resolveTagIds(tx, userId, names);
  if (ids.length) await tx.insert(taskTags).values(ids.map((tagId) => ({ taskId, tagId }))).onConflictDoNothing();
}

export async function createTask(ctx: ServiceCtx, input: TaskCreateBody) {
  const userId = ctx.actor.userId;
  await assertRefs(userId, input.categoryId, input.eventId);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        userId, title: input.title, description: input.description ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null, priority: input.priority, status: input.status,
        categoryId: input.categoryId ?? null, eventId: input.eventId ?? null,
        completedAt: input.status === "completed" ? new Date() : null, source: sourceOf(ctx),
      })
      .returning({ id: tasks.id });
    if (input.tags?.length) await setTags(tx, userId, row!.id, input.tags);
    if (input.reminders?.length)
      await tx.insert(reminders).values(input.reminders.map((r) => ({ userId, targetType: "task" as const, taskId: row!.id, offsetMinutes: r.offsetMinutes, channel: r.channel })));
    return row!.id;
  });
  await audit(ctx, { action: "task.create", resourceType: "task", resourceId: id, changes: { title: input.title, priority: input.priority, dueAt: input.dueAt ?? null } });
  return getTask(ctx, id);
}

export async function updateTask(ctx: ServiceCtx, id: string, patch: TaskUpdateBody) {
  const userId = ctx.actor.userId;
  const before = await loadOwned(userId, id);
  await assertRefs(userId, patch.categoryId, patch.eventId);
  const { tags: tagNames, dueAt, ...rest } = patch;
  const set: Partial<typeof tasks.$inferInsert> = { ...rest, ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }), updatedAt: new Date() };
  if (patch.status !== undefined) {
    if (patch.status === "completed" && before.status !== "completed") set.completedAt = new Date();
    else if (patch.status !== "completed") set.completedAt = null;
  }
  await db.transaction(async (tx) => {
    await tx.update(tasks).set(set).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    if (tagNames) await setTags(tx, userId, id, tagNames);
  });
  await audit(ctx, { action: "task.update", resourceType: "task", resourceId: id, changes: { ...diff(before, { ...rest, dueAt: dueAt === undefined ? undefined : dueAt ? new Date(dueAt) : null }), ...(tagNames && { tags: tagNames }) } });
  return getTask(ctx, id);
}

export async function deleteTask(ctx: ServiceCtx, id: string) {
  const before = await loadOwned(ctx.actor.userId, id);
  await db.update(tasks).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, ctx.actor.userId)));
  await audit(ctx, { action: "task.delete", resourceType: "task", resourceId: id, changes: { title: before.title } });
  return { id };
}

export async function restoreTask(ctx: ServiceCtx, id: string) {
  await loadOwned(ctx.actor.userId, id, true);
  await db.update(tasks).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, ctx.actor.userId)));
  await audit(ctx, { action: "task.restore", resourceType: "task", resourceId: id });
  return getTask(ctx, id);
}

// ---------- consultas para agenda/dashboard/búsqueda ----------
export async function tasksDueBetween(userId: string, from: Date, to: Date, statuses: Row["status"][], tz: string, limit = 200) {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), inArray(tasks.status, statuses), gte(tasks.dueAt, from), lt(tasks.dueAt, to)))
    .orderBy(asc(tasks.dueAt))
    .limit(limit);
  return tasksToDtos(rows, tz);
}

export async function overdueTasks(userId: string, now: Date, tz: string, limit = 10) {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), inArray(tasks.status, [...OPEN]), lt(tasks.dueAt, now)))
    .orderBy(asc(tasks.dueAt))
    .limit(limit);
  return tasksToDtos(rows, tz, now);
}

export async function taskStats(userId: string, now: Date, todayFrom: Date, todayTo: Date, weekFrom: Date, weekTo: Date) {
  const [r] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${tasks.status} = 'pending')::int`,
      inProgress: sql<number>`count(*) filter (where ${tasks.status} = 'in_progress')::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.status} in ('pending','in_progress') and ${tasks.dueAt} < ${now})::int`,
      dueToday: sql<number>`count(*) filter (where ${tasks.status} in ('pending','in_progress') and ${tasks.dueAt} >= ${todayFrom} and ${tasks.dueAt} < ${todayTo})::int`,
      completedThisWeek: sql<number>`count(*) filter (where ${tasks.status} = 'completed' and ${tasks.completedAt} >= ${weekFrom} and ${tasks.completedAt} < ${weekTo})::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));
  return r!;
}
