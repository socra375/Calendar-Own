import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/constants";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { parseCookies } from "../http/request-info";

export const sessionTtlMs = SESSION_TTL_DAYS * 24 * 3600 * 1000;
const REFRESH_AFTER_MS = 60 * 60 * 1000; // renovar (deslizante) como máximo 1 vez/hora

export const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });
  // Limpieza oportunista de sesiones expiradas.
  if (Math.random() < 0.05) {
    void db.delete(sessions).where(lt(sessions.expiresAt, new Date())).catch(() => undefined);
  }
  return { token, expiresAt };
}

export async function validateSession(
  token: string | undefined | null,
): Promise<{ user: SessionUser; sessionId: string; refreshed: boolean; expiresAt: Date } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;

  let refreshed = false;
  let expiresAt = row.expiresAt;
  if (now.getTime() - row.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    expiresAt = new Date(now.getTime() + sessionTtlMs);
    await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, row.sessionId));
    refreshed = true;
  }
  return { user: { id: row.id, email: row.email, name: row.name }, sessionId: row.sessionId, refreshed, expiresAt };
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function getSessionTokenFromRequest(req: Request): string | undefined {
  return parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
}

function secureCookies(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const appUrl = process.env.APP_URL ?? "";
  return !/^http:\/\/(localhost|127\.0\.0\.1)/.test(appUrl);
}

function serialize(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (maxAgeSeconds === 0) parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  if (secureCookies()) parts.push("Secure");
  return parts.join("; ");
}

/** Valor de la cabecera Set-Cookie para una sesión viva. */
export function sessionCookie(token: string, expiresAt: Date): string {
  return serialize(token, Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)));
}

/** Set-Cookie que borra la cookie de sesión. */
export function clearedSessionCookie(): string {
  return serialize("", 0);
}
