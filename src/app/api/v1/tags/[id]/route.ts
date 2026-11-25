import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { tagUpdateBody } from "@/lib/validation/tags";
import { deleteTag, getTag, updateTag } from "@/server/services/tags.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await getTag(ctx, ctx.params.id)));
export const PATCH = apiHandler({ auth: "any", params: idParam, body: tagUpdateBody }, async (ctx) =>
  ok(await updateTag(ctx, ctx.params.id, ctx.body), { message: "Actualizado" }),
);
export const DELETE = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await deleteTag(ctx, ctx.params.id), { message: "Eliminado" }));
