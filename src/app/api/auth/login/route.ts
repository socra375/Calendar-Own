import { sql } from "drizzle-orm";
import { z } from "zod";
import { verifyDummy, verifyPassword } from "@/server/auth/password";
import { createSession, sessionCookie } from "@/server/auth/session";
import { audit } from "@/server/audit/audit.service";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";
import { checkRateLimit, clearRateLimit } from "@/server/http/rate-limit";
import { ok } from "@/server/http/response";

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

const WINDOW = 15 * 60;

export const POST = apiHandler({ auth: "public", body, rateLimit: false }, async (ctx) => {
  const { email, password } = ctx.body;
  const key = `login:${email}:${ctx.ip}`;

  // 5 intentos / 15 min por email+IP, más tope por IP para evitar enumeración masiva.
  const [perId, perIp] = await Promise.all([
    checkRateLimit(db, { key, limit: 5, windowSeconds: WINDOW }),
    checkRateLimit(db, { key: `login-ip:${ctx.ip}`, limit: 30, windowSeconds: WINDOW }),
  ]);
  if (!perId.allowed || !perIp.allowed) {
    const retry = Math.max(perId.retryAfterSeconds, perIp.retryAfterSeconds);
    await audit(
      { actor: { type: "user" }, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      { action: "auth.login", resourceType: "session", result: "failure", changes: { email, reason: "rate_limited" } },
    );
    throw new AppError("RATE_LIMITED", 429, "Demasiados intentos. Inténtalo de nuevo más tarde.", { retryAfterSeconds: retry }, {
      "Retry-After": String(retry),
    });
  }

  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  const valid = user ? await verifyPassword(user.passwordHash, password) : await verifyDummy(password);

  if (!user || !valid) {
    await audit(
      { actor: { type: "user", userId: user?.id ?? null }, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      { action: "auth.login", resourceType: "session", result: "failure", changes: { email, reason: "invalid_credentials" } },
    );
    throw new AppError("UNAUTHORIZED", 401, "Credenciales inválidas");
  }

  await clearRateLimit(db, key);
  const { token, expiresAt } = await createSession(user.id, { ip: ctx.ip, userAgent: ctx.userAgent });
  await audit(
    { actor: { type: "user", userId: user.id }, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
    { action: "auth.login", resourceType: "session" },
  );
  return ok(
    { user: { id: user.id, email: user.email, name: user.name } },
    { message: "Sesión iniciada", headers: { "Set-Cookie": sessionCookie(token, expiresAt) } },
  );
});
