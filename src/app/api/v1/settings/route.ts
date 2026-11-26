import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { ok } from "@/server/http/response";
import { settingsUpdateBody } from "@/lib/validation/settings";
import { getUserSettings, updateUserSettings } from "@/server/services/settings.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any" }, async (ctx) => ok(await getUserSettings(ctx)));
export const PATCH = apiHandler({ auth: "any", body: settingsUpdateBody }, async (ctx) => ok(await updateUserSettings(ctx, ctx.body), { message: "Actualizado" }));
