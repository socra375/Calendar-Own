import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { availabilityQuery } from "@/lib/validation/events";
import { getAvailability } from "@/server/services/availability.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: availabilityQuery }, async (ctx) => ok(await getAvailability(ctx, ctx.query)));
