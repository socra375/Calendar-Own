import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created, paginated } from "@/server/http/response";
import { categoryCreateBody, categoryListQuery } from "@/lib/validation/categories";
import { createCategory, listCategories } from "@/server/services/categories.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: categoryListQuery }, async (ctx) => {
  const r = await listCategories(ctx, ctx.query);
  return paginated(r.items, { page: ctx.query.page, pageSize: ctx.query.pageSize, total: r.total });
});
export const POST = apiHandler({ auth: "any", body: categoryCreateBody }, async (ctx) => created(await createCategory(ctx, ctx.body)));
