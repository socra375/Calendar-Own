import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created, paginated } from "@/server/http/response";
import { reminderCreateBody, reminderListQuery } from "@/lib/validation/reminders";
import { createReminder, listReminders } from "@/server/services/reminders.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: reminderListQuery }, async (ctx) => {
  const r = await listReminders(ctx, ctx.query);
  return paginated(r.items, { page: ctx.query.page, pageSize: ctx.query.pageSize, total: r.total });
});
export const POST = apiHandler({ auth: "any", body: reminderCreateBody }, async (ctx) => created(await createReminder(ctx, ctx.body)));
