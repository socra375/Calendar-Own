import { z } from "zod";
import { hexColor, isoDate, pageQuery, queryBool, rangeBound, uuid } from "./common";

export const SPECIAL_DATE_TYPES = ["birthday", "holiday", "celebration", "anniversary", "personal"] as const;

const f = {
  title: z.string().trim().min(1).max(200),
  type: z.enum(SPECIAL_DATE_TYPES),
  date: isoDate,
  recursYearly: z.boolean(),
  color: hexColor.nullable(),
  icon: z.string().trim().max(50).nullable(),
  description: z.string().max(5000).nullable(),
};

export const specialDateCreateBody = z.object({
  title: f.title,
  type: f.type.default("personal"),
  date: f.date,
  recursYearly: f.recursYearly.optional(),
  color: f.color.optional(),
  icon: f.icon.optional(),
  description: f.description.optional(),
});
export const specialDateUpdateBody = z
  .object(f)
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo");

export const specialDateListQuery = pageQuery.extend({
  q: z.string().trim().max(200).optional(),
  type: z.enum(SPECIAL_DATE_TYPES).optional(),
  from: rangeBound.optional(),
  to: rangeBound.optional(),
  sort: z.enum(["next", "date", "-date", "title"]).default("next"),
  deleted: queryBool.optional(),
});

export const specialDateOut = z.object({
  id: uuid,
  title: z.string(),
  type: z.enum(SPECIAL_DATE_TYPES),
  date: z.string().describe("Fecha de origen"),
  recursYearly: z.boolean(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  description: z.string().nullable(),
  nextOccurrence: z.string().nullable().describe("Próxima fecha local YYYY-MM-DD (hoy incluido); null si ya pasó y no se repite"),
  daysUntil: z.number().int().nullable(),
  yearsSince: z.number().int().nullable().describe("Años cumplidos en nextOccurrence (cumpleaños/aniversarios)"),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export const specialDateOccurrenceOut = specialDateOut.extend({
  occurrenceDate: z.string(),
});
