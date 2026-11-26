import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { reminderUpdateBody } from "@/lib/validation/reminders";
import { deleteReminder, getReminder, updateReminder } from "@/server/services/reminders.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await getReminder(ctx, ctx.params.id)));
export const PATCH = apiHandler({ auth: "any", params: idParam, body: reminderUpdateBody }, async (ctx) =>
  ok(await updateReminder(ctx, ctx.params.id, ctx.body), { message: "Actualizado" }),
);
export const DELETE = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await deleteReminder(ctx, ctx.params.id), { message: "Eliminado" }));
