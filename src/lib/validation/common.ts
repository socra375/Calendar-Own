import { z } from "zod";

export const uuid = z.uuid();
export const isoDateTime = z.iso.datetime({ offset: true });
export const isoDate = z.iso.date();
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Formato HH:mm");
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex #RRGGBB");
export const ianaTimezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Zona horaria IANA inválida");

/** 'true' | 'false' | '1' | '0' en query string. */
export const queryBool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

/** from/to aceptan instante ISO con offset o fecha 'YYYY-MM-DD' (día local del usuario; `to` fecha = día inclusivo). */
export const rangeBound = z.union([isoDateTime, isoDate]);

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const idParam = z.object({ id: uuid });

/** Lista separada por comas -> arreglo. */
export const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v),
    z.array(item).max(100),
  );

export const paginationOut = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const conflictItemOut = z.object({
  eventId: z.string(),
  occurrenceKey: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  isBlocking: z.boolean(),
  isAllDay: z.boolean(),
});

/** Envelope genérico para documentación. */
export const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    success: z.boolean(),
    data,
    error: z.object({ code: z.string(), details: z.unknown().optional() }).nullable(),
    message: z.string(),
    pagination: paginationOut.nullable(),
    meta: z.object({ requestId: z.string(), conflicts: z.array(conflictItemOut).optional() }).passthrough(),
  });

export const nullableText = (max: number) => z.string().max(max).nullable();
