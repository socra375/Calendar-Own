import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { TOKEN_PREFIX } from "@/lib/constants";
import { db } from "../db/client";
import { apiTokens, users } from "../db/schema";
import { NotFoundError } from "../http/errors";

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) };
}

export interface VerifiedToken {
  userId: string;
  tokenId?: string; // undefined cuando viene de EDDIE_API_TOKEN_HASH
  scopes: string[];
}

const publicCols = {
  id: apiTokens.id,
  name: apiTokens.name,
  tokenPrefix: apiTokens.tokenPrefix,
  scopes: apiTokens.scopes,
  lastUsedAt: apiTokens.lastUsedAt,
  expiresAt: apiTokens.expiresAt,
  revokedAt: apiTokens.revokedAt,
  rotatedFromId: apiTokens.rotatedFromId,
  createdAt: apiTokens.createdAt,
};

export async function createToken(
  userId: string,
  input: { name: string; scopes?: string[]; expiresAt?: Date | null; rotatedFromId?: string | null },
) {
  const { token, hash, prefix } = generateToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name: input.name,
      tokenHash: hash,
      tokenPrefix: prefix,
      scopes: input.scopes ?? ["*"],
      expiresAt: input.expiresAt ?? null,
      rotatedFromId: input.rotatedFromId ?? null,
    })
    .returning(publicCols);
  // `token` en claro solo se devuelve aquí, una vez.
  return { token, record: row! };
}

export async function listTokens(userId: string) {
  return db.select(publicCols).from(apiTokens).where(eq(apiTokens.userId, userId)).orderBy(desc(apiTokens.createdAt));
}

export async function revokeToken(userId: string, tokenId: string) {
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning(publicCols);
  if (!row) throw new NotFoundError("Token no encontrado o ya revocado");
  return row;
}

/** Crea un token nuevo (hereda nombre/scopes/expiración) y revoca el anterior atómicamente. */
export async function rotateToken(userId: string, tokenId: string) {
  return db.transaction(async (tx) => {
    const [old] = await tx
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      .returning();
    if (!old) throw new NotFoundError("Token no encontrado o ya revocado");
    const { token, hash, prefix } = generateToken();
    const [row] = await tx
      .insert(apiTokens)
      .values({
        userId,
        name: old.name,
        tokenHash: hash,
        tokenPrefix: prefix,
        scopes: old.scopes,
        expiresAt: old.expiresAt,
        rotatedFromId: old.id,
      })
      .returning(publicCols);
    return { token, record: row! };
  });
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/** Valida un token `pc_…`. Devuelve null si no existe, está revocado o expirado. */
export async function verifyToken(raw: string): Promise<VerifiedToken | null> {
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length < 20 || raw.length > 200) return null;
  const hash = hashToken(raw);
  const now = new Date();

  const [row] = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId, scopes: apiTokens.scopes, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenHash, hash),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
      ),
    )
    .limit(1);

  if (row) {
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
      await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id));
    }
    return { userId: row.userId, tokenId: row.id, scopes: row.scopes };
  }

  // Bootstrap opcional: un único token Eddie definido por hash en el entorno.
  const envHash = process.env.EDDIE_API_TOKEN_HASH?.trim().toLowerCase();
  if (envHash && safeEqualHex(envHash, hash)) {
    const [owner] = await db.select({ id: users.id }).from(users).orderBy(users.createdAt).limit(1);
    if (owner) return { userId: owner.id, scopes: ["*"] };
  }
  return null;
}
