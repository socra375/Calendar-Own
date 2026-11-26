import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { restoreCategory } from "@/server/services/categories.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await restoreCategory(ctx, ctx.params.id), { message: "Restaurado" }));
