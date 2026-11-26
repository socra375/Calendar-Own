import { z } from "zod";
import { isoDateTime, uuid } from "./common";

export const tokenCreateBody = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.string().trim().min(1).max(50)).min(1).max(20).default(["*"]),
  expiresAt: isoDateTime.nullable().optional(),
});
export const tokenOut = z.object({
  id: uuid,
  name: z.string(),
  tokenPrefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  rotatedFromId: uuid.nullable(),
  createdAt: z.string(),
});
export const tokenCreatedOut = z.object({
  token: z.string().describe("Valor completo pc_…; se muestra UNA sola vez"),
  record: tokenOut,
});
