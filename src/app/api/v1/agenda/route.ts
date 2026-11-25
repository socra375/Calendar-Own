import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { agendaQuery } from "@/lib/validation/agenda";
import { getAgenda } from "@/server/services/agenda.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: agendaQuery }, async (ctx) => ok(await getAgenda(ctx, ctx.query)));
