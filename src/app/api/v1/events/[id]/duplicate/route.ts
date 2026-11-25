import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { created } from "@/server/http/response";
import { idParam } from "@/lib/validation/common";
import { eventDuplicateBody } from "@/lib/validation/events";
import { duplicateEvent } from "@/server/services/events.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = apiHandler({ auth: "any", params: idParam, body: eventDuplicateBody }, async (ctx) => {
  const r = await duplicateEvent(ctx, ctx.params.id, ctx.body);
  return created(r.event, { message: "Duplicado", meta: { conflicts: r.conflicts } });
});
