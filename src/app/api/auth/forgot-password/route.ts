import { after } from "next/server";
import { FORGOT_PASSWORD_MESSAGE, forgotPasswordBody } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/server/auth/password-reset";
import { db } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { ok } from "@/server/http/response";

const WINDOW = 60 * 60;

/**
 * Siempre 200 con el mismo mensaje exista o no el correo (sin enumeración). El envío se desacopla de la respuesta
 * con `after()` para que la latencia no delate si la cuenta existe; fuera de un request de Next (tests) se espera.
 */
export const POST = apiHandler({ auth: "public", body: forgotPasswordBody, rateLimit: false }, async (ctx) => {
  const { email } = ctx.body;

  // 3 solicitudes/hora por email+IP y 10/hora por IP (el límite aplica igual exista o no la cuenta).
  const [perId, perIp] = await Promise.all([
    checkRateLimit(db, { key: `forgot:${email}:${ctx.ip}`, limit: 3, windowSeconds: WINDOW }),
    checkRateLimit(db, { key: `forgot-ip:${ctx.ip}`, limit: 10, windowSeconds: WINDOW }),
  ]);
  if (!perId.allowed || !perIp.allowed) {
    const retry = Math.max(perId.allowed ? 0 : perId.retryAfterSeconds, perIp.allowed ? 0 : perIp.retryAfterSeconds);
    throw new AppError("RATE_LIMITED", 429, "Demasiadas solicitudes. Inténtalo de nuevo más tarde.", { retryAfterSeconds: retry }, {
      "Retry-After": String(retry),
    });
  }

  const pending: Promise<void>[] = [];
  await requestPasswordReset(email, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    defer: (job) => {
      try {
        after(job);
      } catch {
        pending.push(job());
      }
    },
  });
  await Promise.all(pending);
  return ok(null, { message: FORGOT_PASSWORD_MESSAGE });
});
