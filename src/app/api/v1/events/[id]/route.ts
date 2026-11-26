import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { eventUpdateBody, scopeQuery } from "@/lib/validation/events";
import { deleteEvent, getEvent, updateEvent } from "@/server/services/events.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", params: idParam }, async (ctx) => ok(await getEvent(ctx, ctx.params.id)));

export const PATCH = apiHandler({ auth: "any", params: idParam, query: scopeQuery, body: eventUpdateBody }, async (ctx) => {
  const r = await updateEvent(ctx, ctx.params.id, ctx.body, ctx.query);
  return ok(r.event, { message: "Actualizado", meta: { conflicts: r.conflicts, ...(r.occurrence && { occurrence: r.occurrence }) } });
});

export const DELETE = apiHandler({ auth: "any", params: idParam, query: scopeQuery }, async (ctx) =>
  ok(await deleteEvent(ctx, ctx.params.id, ctx.query), { message: "Eliminado" }),
);
