import "server-only";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { audit } from "../audit/audit.service";
import { db } from "../db/client";
import { categories } from "../db/schema";
import { ConflictError, NotFoundError } from "../http/errors";
import { andAll, countSql, diff, like, offsetOf, rethrowUnique, type ServiceCtx } from "./common";

type Row = typeof categories.$inferSelect;

export const toCategoryDto = (c: Row) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  color: c.color,
  icon: c.icon,
  isActive: c.isActive,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  deletedAt: c.deletedAt?.toISOString() ?? null,
});

export async function listCategories(
  ctx: ServiceCtx,
  q: { page: number; pageSize: number; q?: string; active?: boolean; deleted?: boolean },
) {
  const where = andAll([
    eq(categories.userId, ctx.actor.userId),
    q.deleted ? isNotNull(categories.deletedAt) : isNull(categories.deletedAt),
    q.active !== undefined ? eq(categories.isActive, q.active) : undefined,
    q.q ? sql`(${categories.name} ilike ${like(q.q)} or ${categories.description} ilike ${like(q.q)})` : undefined,
  ]);
  const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(categories).where(where);
  const rows = await db
    .select()
    .from(categories)
    .where(where)
    .orderBy(asc(sql`lower(${categories.name})`))
    .limit(q.pageSize)
    .offset(offsetOf(q.page, q.pageSize));
  return { items: rows.map(toCategoryDto), total };
}

async function getOwned(userId: string, id: string, deleted = false) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId), deleted ? isNotNull(categories.deletedAt) : isNull(categories.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError("Categoría no encontrada");
  return row;
}

export async function getCategory(ctx: ServiceCtx, id: string) {
  return toCategoryDto(await getOwned(ctx.actor.userId, id));
}

export async function createCategory(
  ctx: ServiceCtx,
  input: { name: string; description?: string | null; color: string; icon?: string | null; isActive: boolean },
) {
  try {
    const [row] = await db
      .insert(categories)
      .values({ userId: ctx.actor.userId, name: input.name, description: input.description ?? null, color: input.color, icon: input.icon ?? null, isActive: input.isActive })
      .returning();
    await audit(ctx, { action: "category.create", resourceType: "category", resourceId: row!.id, changes: { name: row!.name } });
    return toCategoryDto(row!);
  } catch (e) {
    rethrowUnique(e, "Ya existe una categoría con ese nombre");
  }
}

export async function updateCategory(
  ctx: ServiceCtx,
  id: string,
  patch: Partial<{ name: string; description: string | null; color: string; icon: string | null; isActive: boolean }>,
) {
  const before = await getOwned(ctx.actor.userId, id);
  try {
    const [row] = await db
      .update(categories)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.userId, ctx.actor.userId)))
      .returning();
    await audit(ctx, { action: "category.update", resourceType: "category", resourceId: id, changes: diff(before, patch) });
    return toCategoryDto(row!);
  } catch (e) {
    rethrowUnique(e, "Ya existe una categoría con ese nombre");
  }
}

export async function deleteCategory(ctx: ServiceCtx, id: string) {
  const before = await getOwned(ctx.actor.userId, id);
  await db.update(categories).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(categories.id, id), eq(categories.userId, ctx.actor.userId)));
  await audit(ctx, { action: "category.delete", resourceType: "category", resourceId: id, changes: { name: before.name } });
  return { id };
}

export async function restoreCategory(ctx: ServiceCtx, id: string) {
  const before = await getOwned(ctx.actor.userId, id, true);
  const clash = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, ctx.actor.userId), isNull(categories.deletedAt), sql`lower(${categories.name}) = lower(${before.name})`))
    .limit(1);
  if (clash.length) throw new ConflictError("Ya existe una categoría activa con ese nombre");
  const [row] = await db.update(categories).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(categories.id, id), eq(categories.userId, ctx.actor.userId))).returning();
  await audit(ctx, { action: "category.restore", resourceType: "category", resourceId: id });
  return toCategoryDto(row!);
}
