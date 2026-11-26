import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { searchQuery } from "@/lib/validation/search";
import { search } from "@/server/services/search.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: searchQuery }, async (ctx) => ok(await search(ctx, ctx.query)));
