import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created, paginated } from "@/server/http/response";
import { taskCreateBody, taskListQuery } from "@/lib/validation/tasks";
import { createTask, listTasks } from "@/server/services/tasks.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: taskListQuery }, async (ctx) => {
  const r = await listTasks(ctx, ctx.query);
  return paginated(r.items, { page: ctx.query.page, pageSize: ctx.query.pageSize, total: r.total });
});

export const POST = apiHandler({ auth: "any", body: taskCreateBody }, async (ctx) => created(await createTask(ctx, ctx.body)));
