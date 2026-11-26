import { z } from "zod";
import { hexColor, pageQuery, uuid } from "./common";

export const tagCreateBody = z.object({
  name: z.string().trim().min(1).max(50),
  color: hexColor.nullable().optional(),
});
export const tagUpdateBody = z
  .object({ name: z.string().trim().min(1).max(50), color: hexColor.nullable() })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo");
export const tagListQuery = pageQuery.extend({ q: z.string().trim().max(100).optional() });
export const tagOut = z.object({
  id: uuid,
  name: z.string(),
  color: z.string().nullable(),
  createdAt: z.string(),
  usage: z.object({ events: z.number().int(), tasks: z.number().int() }).optional(),
});
