import "server-only";
import { UnauthorizedError } from "../http/errors";
import { getSessionTokenFromRequest, validateSession, type SessionUser } from "./session";
import { verifyToken } from "./tokens";

export interface Actor {
  userId: string;
  type: "user" | "eddie";
  tokenId?: string;
  scopes?: string[];
}

export type AuthMode = "any" | "session" | "token" | "public";

export interface ResolvedActor {
  actor: Actor;
  via: "session" | "token";
  /** Si la sesión se renovó, el handler reenvía la cookie con la nueva expiración. */
  refreshedSession?: { token: string; expiresAt: Date };
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1]! : null;
}

/** Resuelve el actor según el modo. Lanza UnauthorizedError si no hay credenciales válidas. */
export async function resolveActor(req: Request, mode: Exclude<AuthMode, "public">): Promise<ResolvedActor> {
  const raw = bearer(req);
  if (raw) {
    if (mode === "session") throw new UnauthorizedError("Este endpoint solo acepta sesión de usuario");
    const v = await verifyToken(raw);
    if (!v) throw new UnauthorizedError("Token inválido, revocado o expirado");
    return { actor: { userId: v.userId, type: "eddie", tokenId: v.tokenId, scopes: v.scopes }, via: "token" };
  }
  if (mode === "token") throw new UnauthorizedError("Se requiere token Bearer");
  const sessionToken = getSessionTokenFromRequest(req);
  const s = await validateSession(sessionToken);
  if (!s) throw new UnauthorizedError();
  return {
    actor: { userId: s.user.id, type: "user" },
    via: "session",
    refreshedSession: s.refreshed ? { token: sessionToken!, expiresAt: s.expiresAt } : undefined,
  };
}

/** Para server components/layouts: usuario de la sesión actual o null. */
export async function getPageUser(): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  const { SESSION_COOKIE } = await import("@/lib/constants");
  const store = await cookies();
  const s = await validateSession(store.get(SESSION_COOKIE)?.value);
  return s?.user ?? null;
}
