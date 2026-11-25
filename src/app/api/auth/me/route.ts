import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { userSettings, users } from "@/server/db/schema";
import { NotFoundError } from "@/server/http/errors";
import { apiHandler } from "@/server/http/handler";
import { ok } from "@/server/http/response";

export const GET = apiHandler({ auth: "any" }, async (ctx) => {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, ctx.actor.userId))
    .limit(1);
  if (!user) throw new NotFoundError("Usuario no encontrado");
  const [settings] = await db
    .select({ timezone: userSettings.timezone, theme: userSettings.theme, displayName: userSettings.displayName })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);
  return ok({ user, actor: { type: ctx.actor.type, tokenId: ctx.actor.tokenId ?? null }, settings: settings ?? null });
});
