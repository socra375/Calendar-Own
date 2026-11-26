import "server-only";
import { createToken, listTokens, revokeToken, rotateToken } from "../auth/tokens";
import { audit } from "../audit/audit.service";
import type { ServiceCtx } from "./common";

type Rec = Awaited<ReturnType<typeof listTokens>>[number];

export const tokenDto = (t: Rec) => ({
  id: t.id,
  name: t.name,
  tokenPrefix: t.tokenPrefix,
  scopes: t.scopes,
  lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  expiresAt: t.expiresAt?.toISOString() ?? null,
  revokedAt: t.revokedAt?.toISOString() ?? null,
  rotatedFromId: t.rotatedFromId,
  createdAt: t.createdAt.toISOString(),
});

export async function listApiTokens(ctx: ServiceCtx) {
  return (await listTokens(ctx.actor.userId)).map(tokenDto);
}

// El token en claro solo se devuelve aquí y NUNCA se escribe en audit.
export async function createApiToken(ctx: ServiceCtx, i: { name: string; scopes: string[]; expiresAt?: string | null }) {
  const { token, record } = await createToken(ctx.actor.userId, { name: i.name, scopes: i.scopes, expiresAt: i.expiresAt ? new Date(i.expiresAt) : null });
  await audit(ctx, { action: "token.create", resourceType: "api_token", resourceId: record.id, changes: { name: record.name, prefix: record.tokenPrefix, scopes: record.scopes } });
  return { token, record: tokenDto(record) };
}

export async function rotateApiToken(ctx: ServiceCtx, id: string) {
  const { token, record } = await rotateToken(ctx.actor.userId, id);
  await audit(ctx, { action: "token.rotate", resourceType: "api_token", resourceId: id, changes: { newTokenId: record.id, prefix: record.tokenPrefix } });
  return { token, record: tokenDto(record) };
}

export async function revokeApiToken(ctx: ServiceCtx, id: string) {
  const record = await revokeToken(ctx.actor.userId, id);
  await audit(ctx, { action: "token.revoke", resourceType: "api_token", resourceId: id, changes: { name: record.name } });
  return tokenDto(record);
}
