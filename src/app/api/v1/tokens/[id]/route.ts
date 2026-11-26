import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { revokeApiToken } from "@/server/services/tokens.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const DELETE = apiHandler({ auth: "session", params: idParam }, async (ctx) => ok(await revokeApiToken(ctx, ctx.params.id), { message: "Token revocado" }));
