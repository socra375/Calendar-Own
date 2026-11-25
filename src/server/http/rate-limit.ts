import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/create";
import { rateLimits } from "../db/schema";
import { RateLimitedError } from "./errors";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Ventana fija en Postgres. El upsert es atómico (INSERT ... ON CONFLICT DO UPDATE count+1),
 * seguro bajo concurrencia y serverless (sin memoria compartida).
 */
export async function checkRateLimit(
  db: Db,
  opts: { key: string; limit: number; windowSeconds: number; now?: Date },
): Promise<RateLimitResult> {
  const now = opts.now ?? new Date();
  const windowMs = opts.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key: opts.key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  // Limpieza oportunista (~1% de las llamadas) de ventanas viejas.
  if (Math.random() < 0.01) {
    void db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, new Date(now.getTime() - 24 * 3600 * 1000)))
      .catch(() => undefined);
  }

  const count = row!.count;
  return {
    allowed: count <= opts.limit,
    count,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000)),
  };
}

/** Como checkRateLimit pero lanza RateLimitedError (429) al exceder. */
export async function enforceRateLimit(
  db: Db,
  opts: { key: string; limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const r = await checkRateLimit(db, opts);
  if (!r.allowed) throw new RateLimitedError(r.retryAfterSeconds);
  return r;
}

/** Borra los contadores de una clave (p. ej. tras login correcto). */
export async function clearRateLimit(db: Db, key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}


