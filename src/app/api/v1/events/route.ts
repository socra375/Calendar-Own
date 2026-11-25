import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ConfirmationRequiredError } from "@/server/http/errors";
import { created, ok, paginated } from "@/server/http/response";
import { bulkDeleteQuery, eventCreateBody, eventListQuery } from "@/lib/validation/events";
import { bulkDeleteEvents, createEvent, listEvents } from "@/server/services/events.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: eventListQuery }, async (ctx) => {
  const r = await listEvents(ctx, ctx.query);
  return paginated(r.items, { page: ctx.query.page, pageSize: ctx.query.pageSize, total: r.total }, { meta: r.meta });
});

export const POST = apiHandler({ auth: "any", body: eventCreateBody }, async (ctx) => {
  const r = await createEvent(ctx, ctx.body);
  return created(r.event, { meta: { conflicts: r.conflicts } });
});

/** Borrado masivo: DELETE /events?ids=a,b (máx. 100) con cabecera X-Confirm-Bulk: true. */
export const DELETE = apiHandler({ auth: "any", query: bulkDeleteQuery }, async (ctx) => {
  if (ctx.req.headers.get("x-confirm-bulk") !== "true")
    throw new ConfirmationRequiredError("El borrado masivo requiere la cabecera X-Confirm-Bulk: true", { count: ctx.query.ids.length });
  return ok(await bulkDeleteEvents(ctx, ctx.query.ids), { message: "Eventos eliminados" });
});
