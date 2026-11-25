import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { audit } from "../audit/audit.service";
import { db, type DbOrTx } from "../db/client";
import { eventTags, taskTags, tags } from "../db/schema";
import { NotFoundError } from "../http/errors";
import { andAll, countSql, diff, like, offsetOf, rethrowUnique, type ServiceCtx } from "./common";

type TagRow = typeof tags.$inferSelect;

export const toTagDto = (t: TagRow) => ({
  id: t.id,
  name: t.name,
  color: t.color,
  createdAt: t.createdAt.toISOString(),
});

/** Resuelve (y crea si faltan) etiquetas por nombre, sin distinguir mayúsculas. Devuelve ids. */
export async function resolveTagIds(tx: DbOrTx, userId: string, names: string[]): Promise<string[]> {
  const seen = new Map<string, string>();
  for (const n of names) if (n.trim() && !seen.has(n.trim().toLowerCase())) seen.set(n.trim().toLowerCase(), n.trim());
  const clean = [...seen.entries()];
  if (!clean.length) return [];
  await tx
    .insert(tags)
    .values(clean.map(([, name]) => ({ userId, name })))
    .onConflictDoNothing();
  const rows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(sql`lower(${tags.name})`, clean.map(([k]) => k))));
  return rows.map((r) => r.id);
}

export async function listTags(ctx: ServiceCtx, q: { page: number; pageSize: number; q?: string }) {
  const where = andAll([eq(tags.userId, ctx.actor.userId), q.q ? sql`${tags.name} ilike ${like(q.q)}` : undefined]);
  const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(tags).where(where);
  const rows = await db
    .select({
      tag: tags,
      events: sql<number>`(select count(*)::int from ${eventTags} where ${eventTags.tagId} = ${tags.id})`,
      tasks: sql<number>`(select count(*)::int from ${taskTags} where ${taskTags.tagId} = ${tags.id})`,
    })
    .from(tags)
    .where(where)
    .orderBy(asc(sql`lower(${tags.name})`))
    .limit(q.pageSize)
    .offset(offsetOf(q.page, q.pageSize));
  return { items: rows.map((r) => ({ ...toTagDto(r.tag), usage: { events: r.events, tasks: r.tasks } })), total };
}

async function getOwned(userId: string, id: string) {
  const [row] = await db.select().from(tags).where(and(eq(tags.id, id), eq(tags.userId, userId))).limit(1);
  if (!row) throw new NotFoundError("Etiqueta no encontrada");
  return row;
}

export async function createTag(ctx: ServiceCtx, input: { name: string; color?: string | null }) {
  try {
    const [row] = await db.insert(tags).values({ userId: ctx.actor.userId, name: input.name, color: input.color ?? null }).returning();
    await audit(ctx, { action: "tag.create", resourceType: "tag", resourceId: row!.id, changes: { name: row!.name } });
    return toTagDto(row!);
  } catch (e) {
    rethrowUnique(e, "Ya existe una etiqueta con ese nombre");
  }
}

export async function getTag(ctx: ServiceCtx, id: string) {
  return toTagDto(await getOwned(ctx.actor.userId, id));
}

export async function updateTag(ctx: ServiceCtx, id: string, patch: { name?: string; color?: string | null }) {
  const before = await getOwned(ctx.actor.userId, id);
  try {
    const [row] = await db
      .update(tags)
      .set({ ...(patch.name !== undefined && { name: patch.name }), ...(patch.color !== undefined && { color: patch.color }) })
      .where(and(eq(tags.id, id), eq(tags.userId, ctx.actor.userId)))
      .returning();
    await audit(ctx, { action: "tag.update", resourceType: "tag", resourceId: id, changes: diff(before, patch) });
    return toTagDto(row!);
  } catch (e) {
    rethrowUnique(e, "Ya existe una etiqueta con ese nombre");
  }
}

export async function deleteTag(ctx: ServiceCtx, id: string) {
  const before = await getOwned(ctx.actor.userId, id);
  await db.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, ctx.actor.userId)));
  await audit(ctx, { action: "tag.delete", resourceType: "tag", resourceId: id, changes: { name: before.name } });
  return { id };
}
