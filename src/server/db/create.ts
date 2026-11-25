// Sin `server-only`: lo usan scripts (migrate/seed) y tests.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

export function createDb(url: string, opts: Partial<PoolConfig> = {}) {
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 20_000, ...opts });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
