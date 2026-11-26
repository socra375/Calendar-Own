import { runMigrations } from "@/server/db/migrate";
import { TEST_DATABASE_URL } from "./constants";

export default async function setup() {
  await runMigrations(TEST_DATABASE_URL);
}
