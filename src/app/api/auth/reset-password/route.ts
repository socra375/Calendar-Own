import { resetPasswordBody } from "@/lib/validation/auth";
import { resetPassword } from "@/server/auth/password-reset";
import { clearedSessionCookie } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { ok } from "@/server/http/response";

const WINDOW = 15 * 60;

export const POST = apiHandler({ auth: "public", body: resetPasswordBody, rateLimit: false }, async (ctx) => {
  const rl = await checkRateLimit(db, { key: `reset-ip:${ctx.ip}`, limit: 10, windowSeconds: WINDOW });
  if (!rl.allowed) {
    throw new AppError("RATE_LIMITED", 429, "Demasiados intentos. Inténtalo de nuevo más tarde.", { retryAfterSeconds: rl.retryAfterSeconds }, {
      "Retry-After": String(rl.retryAfterSeconds),
    });
  }
  await resetPassword(ctx.body.token, ctx.body.password, { ip: ctx.ip, userAgent: ctx.userAgent, requestId: ctx.requestId });
  // Si esta petición traía una cookie de sesión (ya destruida en BD), se borra del navegador.
  return ok(null, { message: "Contraseña actualizada. Ya puedes iniciar sesión.", headers: { "Set-Cookie": clearedSessionCookie() } });
});
