import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created, paginated } from "@/server/http/response";
import { specialDateCreateBody, specialDateListQuery } from "@/lib/validation/special-dates";
import { createSpecialDate, listSpecialDates } from "@/server/services/special-dates.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: specialDateListQuery }, async (ctx) => {
  const r = await listSpecialDates(ctx, ctx.query);
  return paginated(r.items, { page: ctx.query.page, pageSize: ctx.query.pageSize, total: r.total });
});
export const POST = apiHandler({ auth: "any", body: specialDateCreateBody }, async (ctx) => created(await createSpecialDate(ctx, ctx.body)));
