import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Actor } from "../auth/actor";
import { db, type DbOrTx } from "../db/client";
import { userSettings } from "../db/schema";
import { ConflictError } from "../http/errors";

/** Contexto que reciben los services (el ctx de apiHandler lo satisface estructuralmente). */
export interface ServiceCtx {
  actor: Actor;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export const sourceOf = (ctx: ServiceCtx): "ui" | "eddie" => (ctx.actor.type === "eddie" ? "eddie" : "ui");

export interface Settings {
  timezone: string;
  workDayStart: string;
  workDayEnd: string;
  workDays: number[];
  weekStartsOn: number;
}

/** Ajustes del usuario; crea la fila por defecto si no existe. */
export async function getSettingsRow(userId: string, tx: DbOrTx = db) {
  const [row] = await tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (row) return row;
  await tx.insert(userSettings).values({ userId }).onConflictDoNothing();
  const [created] = await tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return created!;
}

export async function getSettings(userId: string): Promise<Settings> {
  const r = await getSettingsRow(userId);
  return {
    timezone: r.timezone,
    workDayStart: r.workDayStart.slice(0, 5),
    workDayEnd: r.workDayEnd.slice(0, 5),
    workDays: r.workDays,
    weekStartsOn: r.weekStartsOn,
  };
}

/** Patrón ILIKE seguro (escapa % _ \). */
export function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export const andAll = (conds: (SQL | undefined)[]) => and(...conds.filter((c): c is SQL => !!c));

export const offsetOf = (page: number, pageSize: number) => (page - 1) * pageSize;

export function pgCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const c = (cur as { code?: unknown }).code;
    if (typeof c === "string" && /^[0-9A-Z]{5}$/.test(c)) return c;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Convierte violación UNIQUE (23505) en 409 CONFLICT. */
export function rethrowUnique(e: unknown, message: string): never {
  if (pgCode(e) === "23505") throw new ConflictError(message);
  throw e;
}

/** Diferencias campo a campo entre dos objetos (para audit). */
export function diff(before: Record<string, unknown>, patch: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const prev = before[k];
    const a = prev instanceof Date ? prev.toISOString() : prev;
    const b = v instanceof Date ? v.toISOString() : v;
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: prev ?? null, to: v ?? null };
  }
  return changes;
}

export const countSql = sql<number>`count(*)::int`;
