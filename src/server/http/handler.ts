import "server-only";
import { ZodError, type ZodType, type z } from "zod";
import { resolveActor, type Actor, type AuthMode } from "../auth/actor";
import { sessionCookie } from "../auth/session";
import { db } from "../db/client";
import { applyCors } from "./cors";
import { AppError, ForbiddenError, ValidationError } from "./errors";
import { enforceRateLimit } from "./rate-limit";
import { getIp, getUserAgent } from "./request-info";
import { requestStore } from "./request-context";
import { fail } from "./response";
import { safeErrorLog } from "../safe-log";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_BODY_BYTES = 1_000_000;

export type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

export interface ApiHandlerOptions<A extends AuthMode, Q, B, P> {
  auth: A;
  query?: Q;
  body?: B;
  params?: P;
  /** false = sin límite. Por defecto 120 req/min por actor (token o usuario). Público: sin límite salvo que se indique (por IP). */
  rateLimit?: RateLimitConfig | false;
}

type Infer<T> = T extends ZodType ? z.output<T> : undefined;

export interface ApiContext<A extends AuthMode, Q, B, P> {
  req: Request;
  actor: A extends "public" ? Actor | null : Actor;
  query: Infer<Q>;
  body: Infer<B>;
  params: Infer<P>;
  requestId: string;
  ip: string;
  userAgent: string | null;
}

const DEFAULT_LIMIT: RateLimitConfig = { limit: 120, windowSeconds: 60 };

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** CSRF: con cookie de sesión, métodos mutantes exigen Origin = APP_URL (o el propio origin fuera de producción). */
function checkCsrf(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set<string>();
  const app = originOf(process.env.APP_URL);
  if (app) allowed.add(app);
  if (process.env.NODE_ENV !== "production") {
    const self = originOf(req.url);
    if (self) allowed.add(self);
  }
  if (!origin || !allowed.has(origin)) throw new ForbiddenError("Origen no permitido (CSRF)");
}

function formatZod(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message }));
}

function parse<T extends ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(`${what} inválido`, formatZod(r.error));
  return r.data;
}

function queryToObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    out[key] = all.length > 1 ? all : all[0]!;
  }
  return out;
}

async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) throw new ValidationError("Cuerpo demasiado grande");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ValidationError("Cuerpo demasiado grande");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("JSON inválido en el cuerpo de la petición");
  }
}

/**
 * Envuelve un Route Handler con auth, CSRF, rate limit, validación Zod, envelope de errores,
 * X-Request-Id y CORS. Compatible con Next 15/16 (params es Promise).
 */
export function apiHandler<
  A extends AuthMode,
  Q extends ZodType | undefined = undefined,
  B extends ZodType | undefined = undefined,
  P extends ZodType | undefined = undefined,
>(options: ApiHandlerOptions<A, Q, B, P>, fn: (ctx: ApiContext<A, Q, B, P>) => Promise<Response> | Response) {
  return async (req: Request, routeCtx?: RouteContext): Promise<Response> => {
    const requestId = crypto.randomUUID();
    return requestStore.run({ requestId }, async () => {
      let res: Response;
      let refreshed: { token: string; expiresAt: Date } | undefined;
      try {
        const ip = getIp(req);
        const userAgent = getUserAgent(req);

        // 1) Autenticación
        let actor: Actor | null = null;
        if (options.auth !== "public") {
          const r = await resolveActor(req, options.auth);
          actor = r.actor;
          refreshed = r.refreshedSession;
          if (r.via === "session" && MUTATING.has(req.method)) checkCsrf(req);
        }

        // 2) Rate limit
        if (options.rateLimit !== false) {
          const cfg = options.rateLimit ?? (actor ? DEFAULT_LIMIT : null);
          if (cfg) {
            const who = actor ? `api:${actor.tokenId ?? actor.userId}` : `pub:${ip}`;
            // Un límite propio de la ruta (p. ej. /notifications/test) lleva su contador aparte: si compartiera el del
            // límite general, el tráfico normal de la UI lo agotaría y devolvería RATE_LIMITED casi siempre.
            const key = options.rateLimit || !actor ? `${who}:${new URL(req.url).pathname}` : who;
            await enforceRateLimit(db, { key, ...cfg });
          }
        }

        // 3) Validación
        const url = new URL(req.url);
        const rawParams = options.params ? await routeCtx?.params : undefined;
        const params = options.params ? parse(options.params, rawParams ?? {}, "Parámetros de ruta") : undefined;
        const query = options.query ? parse(options.query, queryToObject(url), "Parámetros de consulta") : undefined;
        const body = options.body ? parse(options.body, await readJson(req), "Cuerpo") : undefined;

        res = await fn({
          req,
          actor: actor as ApiContext<A, Q, B, P>["actor"],
          query: query as ApiContext<A, Q, B, P>["query"],
          body: body as ApiContext<A, Q, B, P>["body"],
          params: params as ApiContext<A, Q, B, P>["params"],
          requestId,
          ip,
          userAgent,
        });
      } catch (err) {
        res = toErrorResponse(err, requestId);
      }

      try {
        res.headers.set("X-Request-Id", requestId);
        res.headers.set("Cache-Control", "no-store");
        if (refreshed) res.headers.append("Set-Cookie", sessionCookie(refreshed.token, refreshed.expiresAt));
        applyCors(req, res);
      } catch {
        /* headers inmutables: se ignora */
      }
      return res;
    });
  };
}

function toErrorResponse(err: unknown, requestId: string): Response {
  if (err instanceof AppError) return fail(err);
  if (err instanceof ZodError) return fail(new ValidationError("Datos inválidos", formatZod(err)));
  safeErrorLog(err, `[api] error no controlado requestId=${requestId}`);
  return fail(new AppError("INTERNAL_ERROR", 500, "Error interno del servidor"));
}
