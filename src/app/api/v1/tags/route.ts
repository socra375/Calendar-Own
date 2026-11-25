import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created, paginated } from "@/server/http/response";
import { tagCreateBody, tagListQuery } from "@/lib/validation/tags";
import { createTag, listTags } from "@/server/services/tags.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: tagListQuery }, async (ctx) => {
  const r = await listTags(ctx, ctx.query);
  return paginated(r.items, { page: ctx.query.page, pageSize: ctx.query.pageSize, total: r.total });
});
export const POST = apiHandler({ auth: "any", body: tagCreateBody }, async (ctx) => created(await createTag(ctx, ctx.body)));
