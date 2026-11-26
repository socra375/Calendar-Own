import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { taskUpdateBody } from "@/lib/validation/tasks";
import { deleteTask, getTask, updateTask } from "@/server/services/tasks.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await getTask(ctx, ctx.params.id)));
export const PATCH = apiHandler({ auth: "any", params: idParam, body: taskUpdateBody }, async (ctx) =>
  ok(await updateTask(ctx, ctx.params.id, ctx.body), { message: "Actualizado" }),
);
export const DELETE = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await deleteTask(ctx, ctx.params.id), { message: "Eliminado" }));
