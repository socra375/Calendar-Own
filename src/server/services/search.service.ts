import "server-only";
import { and, asc, desc, eq, exists, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { events, eventRecurrence, eventTags, specialDates, tags, taskTags, tasks } from "../db/schema";
import { getSettings, like, type ServiceCtx } from "./common";
import { bundleDtos } from "./events.service";
import { specialDateDto } from "./special-dates.service";
import { tasksToDtos } from "./tasks.service";
import { toLocalDate } from "../domain/time";
import { countSql } from "./common";

export async function search(ctx: ServiceCtx, q: { q: string; types?: ("event" | "task" | "special_date")[]; limit: number }) {
  const userId = ctx.actor.userId;
  const tz = (await getSettings(userId)).timezone;
  const types = new Set(q.types?.length ? q.types : ["event", "task", "special_date"]);
  const p = like(q.q);
  const out = { query: q.q, events: [] as Awaited<ReturnType<typeof bundleDtos>>, tasks: [] as Awaited<ReturnType<typeof tasksToDtos>>, specialDates: [] as ReturnType<typeof specialDateDto>[], totals: { events: 0, tasks: 0, specialDates: 0 } };

  if (types.has("event")) {
    const where = and(
      eq(events.userId, userId),
      isNull(events.deletedAt),
      sql`(${events.title} ilike ${p} or ${events.description} ilike ${p} or ${events.notes} ilike ${p} or ${events.location} ilike ${p} or ${exists(
        db.select({ one: sql`1` }).from(eventTags).innerJoin(tags, eq(tags.id, eventTags.tagId)).where(and(eq(eventTags.eventId, events.id), sql`${tags.name} ilike ${p}`)),
      )})`,
    );
    const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(events).where(where);
    const rows = await db.select({ ev: events, rec: eventRecurrence }).from(events).leftJoin(eventRecurrence, eq(eventRecurrence.eventId, events.id)).where(where).orderBy(desc(events.startAt), desc(events.startDate)).limit(q.limit);
    out.events = await bundleDtos(rows.map((r) => ({ ev: r.ev, rec: r.rec, exc: [] })));
    out.totals.events = total;
  }
  if (types.has("task")) {
    const where = and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      sql`(${tasks.title} ilike ${p} or ${tasks.description} ilike ${p} or ${exists(
        db.select({ one: sql`1` }).from(taskTags).innerJoin(tags, eq(tags.id, taskTags.tagId)).where(and(eq(taskTags.taskId, tasks.id), sql`${tags.name} ilike ${p}`)),
      )})`,
    );
    const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(tasks).where(where);
    const rows = await db.select().from(tasks).where(where).orderBy(sql`${tasks.dueAt} asc nulls last`).limit(q.limit);
    out.tasks = await tasksToDtos(rows, tz);
    out.totals.tasks = total;
  }
  if (types.has("special_date")) {
    const where = and(eq(specialDates.userId, userId), isNull(specialDates.deletedAt), sql`(${specialDates.title} ilike ${p} or ${specialDates.description} ilike ${p})`);
    const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(specialDates).where(where);
    const rows = await db.select().from(specialDates).where(where).orderBy(asc(specialDates.date)).limit(q.limit);
    const today = toLocalDate(new Date(), tz);
    out.specialDates = rows.map((r) => specialDateDto(r, today));
    out.totals.specialDates = total;
  }
  return out;
}

