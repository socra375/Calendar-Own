// Generador OpenAPI 3.1 a partir de los schemas Zod compartidos (sin librerías extra).
import { z } from "zod";
import { envelope, paginationOut } from "@/lib/validation/common";

export type Method = "get" | "post" | "patch" | "delete";

export interface OpDef {
  method: Method;
  /** Ruta OpenAPI relativa a /api/v1, p. ej. `/events/{id}`. */
  path: string;
  summary: string;
  description?: string;
  tag: string;
  /** any = sesión o token Bearer; session = solo cookie; public = sin auth. */
  auth?: "any" | "session" | "public";
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  headers?: { name: string; description: string; required?: boolean; example?: string }[];
  /** Esquema del campo `data` (para listas paginadas, el del ítem). */
  response: z.ZodType;
  paginated?: boolean;
  status?: number;
  requestExample?: unknown;
  /** Ejemplo del campo `data`. */
  responseExample: unknown;
  /** Ejemplo de `meta` adicional (p. ej. conflicts). */
  metaExample?: Record<string, unknown>;
  errors?: number[];
}


function schemaOf(s: z.ZodType, io: "input" | "output" = "input"): Record<string, unknown> {
  const j = z.toJSONSchema(s, { io, unrepresentable: "any" }) as Record<string, unknown>;
  delete j.$schema;
  return j;
}

const isOptional = (s: z.ZodType) => s.safeParse(undefined).success;

function parametersOf(obj: z.ZodObject, where: "query" | "path") {
  return Object.entries(obj.shape).map(([name, field]) => {
    let sch = schemaOf(field as z.ZodType);
    if (Object.keys(sch).length === 0) sch = { type: "string" };
    const description = (field as z.ZodType).description;
    return {
      name,
      in: where,
      required: where === "path" ? true : !isOptional(field as z.ZodType),
      ...(description && { description }),
      schema: sch,
    };
  });
}

const REQ_ID = "0b1d3f0e-6d62-4c0e-9d49-3d8a0b7a1f11";

function envelopeExample(data: unknown, op: OpDef, success = true) {
  const pagination = op.paginated ? { page: 1, pageSize: 50, total: Array.isArray(data) ? data.length : 1, totalPages: 1 } : null;
  return {
    success,
    data: op.paginated ? data : data,
    error: null,
    message: op.status === 201 ? "Creado" : "OK",
    pagination,
    meta: { requestId: REQ_ID, ...(op.metaExample ?? {}) },
  };
}

const ERROR_EXAMPLES: Record<number, { code: string; message: string; details?: unknown }> = {
  400: { code: "VALIDATION_ERROR", message: "Cuerpo inválido", details: [{ path: "title", code: "too_small", message: "Too small: expected string to have >=1 characters" }] },
  401: { code: "UNAUTHORIZED", message: "No autenticado" },
  403: { code: "FORBIDDEN", message: "Origen no permitido (CSRF)" },
  404: { code: "NOT_FOUND", message: "Recurso no encontrado" },
  409: { code: "BLOCKING_CONFLICT", message: "El horario choca con un evento bloqueante (usa force:true para forzar)", details: { conflicts: [{ eventId: REQ_ID, occurrenceKey: "2030-03-04T13:00:00.000Z", title: "Reunión", start: "2030-03-04T09:00:00.000-04:00", end: "2030-03-04T10:00:00.000-04:00", isBlocking: true, isAllDay: false }] } },
  428: { code: "CONFIRMATION_REQUIRED", message: "El borrado masivo requiere la cabecera X-Confirm-Bulk: true" },
  429: { code: "RATE_LIMITED", message: "Demasiadas solicitudes", details: { retryAfterSeconds: 30 } },
};

const errorEnvelopeSchema = {
  type: "object",
  required: ["success", "data", "error", "message", "pagination", "meta"],
  properties: {
    success: { type: "boolean", const: false },
    data: { type: "null" },
    error: { type: "object", required: ["code"], properties: { code: { type: "string" }, details: {} } },
    message: { type: "string" },
    pagination: { type: "null" },
    meta: { type: "object", properties: { requestId: { type: "string" } } },
  },
};

export function buildOpenApi(ops: OpDef[], opts: { serverUrl?: string; version?: string } = {}) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of ops) {
    const security = op.auth === "public" ? [] : op.auth === "session" ? [{ cookieAuth: [] }] : [{ bearerAuth: [] }, { cookieAuth: [] }];
    const parameters = [
      ...(op.params ? parametersOf(op.params, "path") : []),
      ...(op.query ? parametersOf(op.query, "query") : []),
      ...(op.headers ?? []).map((h) => ({ name: h.name, in: "header", required: h.required ?? false, description: h.description, schema: { type: "string", ...(h.example && { example: h.example }) } })),
    ];
    const status = op.status ?? 200;
    const dataSchema = op.paginated ? z.array(op.response) : op.response;
    const respSchema = schemaOf(op.paginated ? envelope(dataSchema).extend({ pagination: paginationOut }) : envelope(dataSchema), "output");
    const errors = new Set([...(op.errors ?? []), ...(op.auth === "public" ? [] : [401]), ...(op.body || op.query || op.params ? [400] : []), 429]);
    const responses: Record<string, unknown> = {
      [status]: {
        description: status === 201 ? "Creado" : "OK",
        content: { "application/json": { schema: respSchema, example: envelopeExample(op.responseExample, op) } },
      },
    };
    for (const code of [...errors].sort()) {
      const e = ERROR_EXAMPLES[code]!;
      responses[code] = {
        description: e.code,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            example: { success: false, data: null, error: { code: e.code, ...(e.details !== undefined && { details: e.details }) }, message: e.message, pagination: null, meta: { requestId: REQ_ID } },
          },
        },
      };
    }
    const operation: Record<string, unknown> = {
      tags: [op.tag],
      summary: op.summary,
      ...(op.description && { description: op.description }),
      operationId: `${op.method}_${op.path.replace(/[{}]/g, "").replace(/\W+/g, "_").replace(/^_|_$/g, "")}`,
      security,
      ...(parameters.length && { parameters }),
      ...(op.body && {
        requestBody: {
          required: true,
          content: { "application/json": { schema: schemaOf(op.body), ...(op.requestExample !== undefined && { example: op.requestExample }) } },
        },
      }),
      responses,
    };
    (paths[op.path] ??= {})[op.method] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Personal Calendar API",
      version: opts.version ?? "0.1.0",
      description:
        "API REST del calendario personal. Todas las respuestas usan el envelope `{ success, data, error, message, pagination, meta }`.\n\n" +
        "**Autenticación**: `Authorization: Bearer pc_…` (token de Eddie) o cookie de sesión `pc_session`. Las rutas de `/tokens` solo aceptan sesión.\n\n" +
        "**Fechas**: los instantes se devuelven en ISO 8601 con offset de la zona del usuario/evento; además cada elemento incluye `localDate`, `localTime` y `durationMinutes` explícitos. En `from`/`to` una fecha `YYYY-MM-DD` significa día local (en `to`, inclusivo).\n\n" +
        "**Conflictos**: crear/mover eventos devuelve `meta.conflicts`; si choca con un evento `isBlocking` responde 409 `BLOCKING_CONFLICT` salvo `force: true`.",
    },
    servers: [{ url: opts.serverUrl ?? "/api/v1" }],
    tags: [...new Set(ops.map((o) => o.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "pc_<token>", description: "Token de API (Eddie)." },
        cookieAuth: { type: "apiKey", in: "cookie", name: "pc_session", description: "Sesión de usuario (httpOnly)." },
      },
      schemas: { ErrorEnvelope: errorEnvelopeSchema },
    },
  };
}

