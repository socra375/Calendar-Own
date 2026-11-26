import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./create";
import { safeErrorLog } from "../safe-log";

export async function runMigrations(url: string) {
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  config({ path: ".env.local" });
  config();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL no está definida");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("Migraciones aplicadas."))
    .catch((e) => {
      safeErrorLog(e, "[migrate]");
      process.exit(1);
    });
}
