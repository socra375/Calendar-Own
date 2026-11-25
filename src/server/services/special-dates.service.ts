import "server-only";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { audit } from "../audit/audit.service";
import { db } from "../db/client";
import { specialDates } from "../db/schema";
import { resolveBound } from "../domain/format";
import { daysBetween, nextOccurrence, occurrencesBetween, yearsSince } from "../domain/special-dates";
import { addLocalDays, toLocalDate } from "../domain/time";
import { applyDefaultReminders } from "../notifications/defaults";
import { NotFoundError, ValidationError } from "../http/errors";
import { andAll, diff, getSettings, like, offsetOf, type ServiceCtx } from "./common";

type Row = typeof specialDates.$inferSelect;

export function specialDateDto(r: Row, today: string) {
  const next = nextOccurrence(r.date, r.recursYearly, today);
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    date: r.date,
    recursYearly: r.recursYearly,
    color: r.color,
    icon: r.icon,
    description: r.description,
    nextOccurrence: next,
    daysUntil: next ? daysBetween(today, next) : null,
    yearsSince: next && r.recursYearly ? yearsSince(r.date, next) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
  };
}

export async function activeSpecialDates(userId: string) {
  return db.select().from(specialDates).where(and(eq(specialDates.userId, userId), isNull(specialDates.deletedAt)));
}

export async function listSpecialDates(
  ctx: ServiceCtx,
  q: { page: number; pageSize: number; q?: string; type?: Row["type"]; from?: string; to?: string; sort: "next" | "date" | "-date" | "title"; deleted?: boolean },
) {
  const userId = ctx.actor.userId;
  const tz = (await getSettings(userId)).timezone;
  const today = toLocalDate(new Date(), tz);
  if ((q.from && !q.to) || (!q.from && q.to)) throw new ValidationError("`from` y `to` deben enviarse juntos");
  const where = andAll([
    eq(specialDates.userId, userId),
    q.deleted ? isNotNull(specialDates.deletedAt) : isNull(specialDates.deletedAt),
    q.type ? eq(specialDates.type, q.type) : undefined,
    q.q ? sql`(${specialDates.title} ilike ${like(q.q)} or ${specialDates.description} ilike ${like(q.q)})` : undefined,
  ]);
  const rows = await db.select().from(specialDates).where(where).orderBy(asc(specialDates.date)).limit(5000);

  if (q.from && q.to) {
    const from = toLocalDate(resolveBound(q.from, tz, "from"), tz);
    const to = toLocalDate(new Date(resolveBound(q.to, tz, "to").getTime() - 1), tz);
    const occ = rows
      .flatMap((r) => occurrencesBetween(r.date, r.recursYearly, from, to).map((d) => ({ ...specialDateDto(r, today), occurrenceDate: d })))
      .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.title.localeCompare(b.title));
    return { items: occ.slice(offsetOf(q.page, q.pageSize), offsetOf(q.page, q.pageSize) + q.pageSize), total: occ.length };
  }
  const dtos = rows.map((r) => specialDateDto(r, today));
  dtos.sort((a, b) => {
    switch (q.sort) {
      case "next": return (a.nextOccurrence ?? "9999").localeCompare(b.nextOccurrence ?? "9999") || a.title.localeCompare(b.title);
      case "date": return a.date.localeCompare(b.date);
      case "-date": return b.date.localeCompare(a.date);
      default: return a.title.localeCompare(b.title);
    }
  });
  return { items: dtos.slice(offsetOf(q.page, q.pageSize), offsetOf(q.page, q.pageSize) + q.pageSize), total: dtos.length };
}

async function loadOwned(userId: string, id: string, deleted = false) {
  const [r] = await db.select().from(specialDates).where(and(eq(specialDates.id, id), eq(specialDates.userId, userId), deleted ? isNotNull(specialDates.deletedAt) : isNull(specialDates.deletedAt))).limit(1);
  if (!r) throw new NotFoundError("Fecha especial no encontrada");
  return r;
}

const todayOf = async (userId: string) => toLocalDate(new Date(), (await getSettings(userId)).timezone);

export async function getSpecialDate(ctx: ServiceCtx, id: string) {
  return specialDateDto(await loadOwned(ctx.actor.userId, id), await todayOf(ctx.actor.userId));
}

export async function createSpecialDate(
  ctx: ServiceCtx,
  i: { title: string; type: Row["type"]; date: string; recursYearly?: boolean; color?: string | null; icon?: string | null; description?: string | null },
) {
  const r = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(specialDates)
      .values({
        userId: ctx.actor.userId, title: i.title, type: i.type, date: i.date,
        // cumpleaños/festivos/aniversarios se repiten por defecto
        recursYearly: i.recursYearly ?? ["birthday", "anniversary", "holiday"].includes(i.type),
        color: i.color ?? null, icon: i.icon ?? null, description: i.description ?? null,
      })
      .returning();
    // La API de fechas especiales no acepta `reminders`: siempre se aplican los recordatorios por defecto.
    await applyDefaultReminders(tx, ctx.actor.userId, { type: "special_date", id: row!.id });
    return row;
  });
  await audit(ctx, { action: "special_date.create", resourceType: "special_date", resourceId: r!.id, changes: { title: r!.title, type: r!.type, date: r!.date } });
  return specialDateDto(r!, await todayOf(ctx.actor.userId));
}

export async function updateSpecialDate(ctx: ServiceCtx, id: string, patch: Partial<Pick<Row, "title" | "type" | "date" | "recursYearly" | "color" | "icon" | "description">>) {
  const before = await loadOwned(ctx.actor.userId, id);
  const [r] = await db.update(specialDates).set({ ...patch, updatedAt: new Date() }).where(and(eq(specialDates.id, id), eq(specialDates.userId, ctx.actor.userId))).returning();
  await audit(ctx, { action: "special_date.update", resourceType: "special_date", resourceId: id, changes: diff(before, patch) });
  return specialDateDto(r!, await todayOf(ctx.actor.userId));
}

export async function deleteSpecialDate(ctx: ServiceCtx, id: string) {
  const before = await loadOwned(ctx.actor.userId, id);
  await db.update(specialDates).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(specialDates.id, id), eq(specialDates.userId, ctx.actor.userId)));
  await audit(ctx, { action: "special_date.delete", resourceType: "special_date", resourceId: id, changes: { title: before.title } });
  return { id };
}

export async function restoreSpecialDate(ctx: ServiceCtx, id: string) {
  await loadOwned(ctx.actor.userId, id, true);
  const [r] = await db.update(specialDates).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(specialDates.id, id), eq(specialDates.userId, ctx.actor.userId))).returning();
  await audit(ctx, { action: "special_date.restore", resourceType: "special_date", resourceId: id });
  return specialDateDto(r!, await todayOf(ctx.actor.userId));
}

export { addLocalDays };
