import { createHash, timingSafeEqual } from "node:crypto";
import { audit } from "@/server/audit/audit.service";
import { AppError, UnauthorizedError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";
import { ok } from "@/server/http/response";
import { processReminders } from "@/server/notifications/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Comparación en tiempo constante (se comparan hashes de igual longitud). */
function validSecret(req: Request, secret: string): boolean {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return false;
  return timingSafeEqual(digest(m[1]!), digest(secret));
}

// Sin sesión ni tokens de Eddie: solo Bearer CRON_SECRET (Vercel Cron lo envía automáticamente).
const run = apiHandler({ auth: "public", rateLimit: false }, async (ctx) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new AppError("SERVICE_UNAVAILABLE", 503, "CRON_SECRET no está configurado");
  if (!validSecret(ctx.req, secret)) throw new UnauthorizedError("Credenciales de cron inválidas");
  const summary = await processReminders();
  if (summary.materialized + summary.claimed + summary.cancelled + summary.failed > 0) {
    await audit(
      { type: "system", requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      { action: "reminders.process", resourceType: "notification", changes: summary },
    );
  }
  return ok(summary);
});

export const GET = run;
export const POST = run;
