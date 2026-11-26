import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { rotateApiToken } from "@/server/services/tokens.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = apiHandler({ auth: "session", params: idParam }, async (ctx) =>
  created(await rotateApiToken(ctx, ctx.params.id), { message: "Token rotado. El anterior quedó revocado." }),
);
