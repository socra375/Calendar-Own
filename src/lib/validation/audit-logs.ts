import { z } from "zod";
import { pageQuery, rangeBound, uuid } from "./common";

export const auditListQuery = pageQuery.extend({
  from: rangeBound.optional(),
  to: rangeBound.optional(),
  action: z.string().trim().max(100).optional().describe("Coincidencia exacta, o prefijo con '*' (p. ej. event.*)"),
  resourceType: z.string().trim().max(50).optional(),
  resourceId: z.string().trim().max(100).optional(),
  actorType: z.enum(["user", "eddie", "system"]).optional(),
  result: z.enum(["success", "failure"]).optional(),
  q: z.string().trim().max(200).optional(),
});
export const auditOut = z.object({
  id: uuid,
  actorType: z.enum(["user", "eddie", "system"]),
  apiTokenId: uuid.nullable(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  requestId: z.string().nullable(),
  result: z.enum(["success", "failure"]),
  changes: z.unknown(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});
