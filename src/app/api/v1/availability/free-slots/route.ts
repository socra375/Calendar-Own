import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { freeSlotsQuery } from "@/lib/validation/events";
import { getFreeSlots } from "@/server/services/availability.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: freeSlotsQuery }, async (ctx) => ok(await getFreeSlots(ctx, ctx.query)));
