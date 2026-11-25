import "server-only";
import { createDb, type Db } from "./create";

export { createDb, schema } from "./create";
export type { Db } from "./create";

// Singleton por proceso (sobrevive al HMR de dev vía globalThis).
const g = globalThis as unknown as { __pcDb?: ReturnType<typeof createDb> };

function getInstance() {
  if (!g.__pcDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está definida");
    g.__pcDb = createDb(url);
  }
  return g.__pcDb;
}

/** Instancia Drizzle perezosa: no conecta hasta el primer uso. */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop, recv) {
    return Reflect.get(getInstance().db, prop, recv);
  },
});

export function getPool() {
  return getInstance().pool;
}

/** Tipo de transacción o db, para services que aceptan ambos. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
