import { z } from "zod";
import { hexColor, pageQuery, queryBool, uuid } from "./common";

const f = {
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).nullable(),
  color: hexColor,
  icon: z.string().trim().max(50).nullable(),
  isActive: z.boolean(),
};

export const categoryCreateBody = z.object({
  name: f.name,
  description: f.description.optional(),
  color: f.color.default("#3b82f6"),
  icon: f.icon.optional(),
  isActive: f.isActive.default(true),
});
export const categoryUpdateBody = z
  .object(f)
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo");

export const categoryListQuery = pageQuery.extend({
  q: z.string().trim().max(200).optional(),
  active: queryBool.optional(),
  deleted: queryBool.optional(),
});

export const categoryOut = z.object({
  id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  color: z.string(),
  icon: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
