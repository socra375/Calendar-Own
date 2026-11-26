import { clearedSessionCookie, destroySession, getSessionTokenFromRequest } from "@/server/auth/session";
import { audit } from "@/server/audit/audit.service";
import { apiHandler } from "@/server/http/handler";
import { ok } from "@/server/http/response";

export const POST = apiHandler({ auth: "session" }, async (ctx) => {
  await destroySession(getSessionTokenFromRequest(ctx.req));
  await audit(ctx, { action: "auth.logout", resourceType: "session" });
  return ok(null, { message: "Sesión cerrada", headers: { "Set-Cookie": clearedSessionCookie() } });
});
