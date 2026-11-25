import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { specialDateUpdateBody } from "@/lib/validation/special-dates";
import { deleteSpecialDate, getSpecialDate, updateSpecialDate } from "@/server/services/special-dates.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await getSpecialDate(ctx, ctx.params.id)));
export const PATCH = apiHandler({ auth: "any", params: idParam, body: specialDateUpdateBody }, async (ctx) =>
  ok(await updateSpecialDate(ctx, ctx.params.id, ctx.body), { message: "Actualizado" }),
);
export const DELETE = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await deleteSpecialDate(ctx, ctx.params.id), { message: "Eliminado" }));
