import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created, ok } from "@/server/http/response";
import { tokenCreateBody } from "@/lib/validation/tokens";
import { createApiToken, listApiTokens } from "@/server/services/tokens.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// Gestión de tokens: SOLO sesión de usuario (un token Eddie nunca puede crear/rotar/revocar tokens).
export const GET = apiHandler({ auth: "session" }, async (ctx) => ok(await listApiTokens(ctx)));
export const POST = apiHandler({ auth: "session", body: tokenCreateBody }, async (ctx) =>
  created(await createApiToken(ctx, ctx.body), { message: "Token creado. Cópialo ahora: no se volverá a mostrar." }),
);
