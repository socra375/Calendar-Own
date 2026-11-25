import { sql } from "drizzle-orm";
import pkg from "../../../../../package.json";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { db } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok, fail } from "@/server/http/response";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "public" }, async () => {
  let dbUp = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbUp = false;
  }
  const env = process.env;
  const data = {
    status: dbUp ? "ok" : "degraded",
    database: dbUp ? "up" : "down",
    version: pkg.version,
    serverTime: new Date().toISOString(),
    timezone: env.DEFAULT_TIMEZONE || DEFAULT_TIMEZONE,
    integrations: {
      telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
      email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    },
  };
  if (!dbUp) return fail(new AppError("SERVICE_UNAVAILABLE", 503, "Base de datos no disponible", data));
  return ok(data);
});
