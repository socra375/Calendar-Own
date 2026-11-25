function allowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

const ALLOW_HEADERS = "Authorization, Content-Type, X-Confirm-Bulk, X-Request-Id";
const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

/** Devuelve el origin si está permitido (lista vacía = sin CORS). */
export function corsOriginFor(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  return allowedOrigins().includes(origin.replace(/\/$/, "")) ? origin : null;
}

export function applyCors(req: Request, res: Response): Response {
  const origin = corsOriginFor(req);
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.append("Vary", "Origin");
    res.headers.set("Access-Control-Expose-Headers", "X-Request-Id, Retry-After");
  }
  return res;
}

/** Úsalo como `export const OPTIONS = preflight;` en las rutas que deban responder preflight. */
export function preflight(req: Request): Response {
  const origin = corsOriginFor(req);
  const res = new Response(null, { status: origin ? 204 : 403 });
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
    res.headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
    res.headers.set("Access-Control-Max-Age", "600");
    res.headers.append("Vary", "Origin");
  }
  return res;
}
