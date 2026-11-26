import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { categoryUpdateBody } from "@/lib/validation/categories";
import { deleteCategory, getCategory, updateCategory } from "@/server/services/categories.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await getCategory(ctx, ctx.params.id)));
export const PATCH = apiHandler({ auth: "any", params: idParam, body: categoryUpdateBody }, async (ctx) =>
  ok(await updateCategory(ctx, ctx.params.id, ctx.body), { message: "Actualizado" }),
);
export const DELETE = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await deleteCategory(ctx, ctx.params.id), { message: "Eliminado" }));
