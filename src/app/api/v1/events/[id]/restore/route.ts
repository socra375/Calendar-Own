import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { restoreEvent } from "@/server/services/events.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await restoreEvent(ctx, ctx.params.id), { message: "Restaurado" }));
