import { sql } from "drizzle-orm";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { createToken } from "@/server/auth/tokens";
import { db } from "@/server/db/client";
import { userSettings, users } from "@/server/db/schema";
import { SESSION_COOKIE } from "@/lib/constants";

/** Vacía todas las tablas del esquema public (la BD de tests es desechable). */
export async function resetDb() {
  const res = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = res.rows.map((r) => `"public"."${r.tablename}"`);
  if (names.length) await db.execute(sql.raw(`truncate table ${names.join(", ")} restart identity cascade`));
}

export async function createTestUser(opts: { email?: string; password?: string; name?: string } = {}) {
  const email = (opts.email ?? "owner@test.local").toLowerCase();
  const password = opts.password ?? "correct-horse-battery";
  const [user] = await db
    .insert(users)
    .values({ email, name: opts.name ?? "Test Owner", passwordHash: await hashPassword(password) })
    .returning();
  await db.insert(userSettings).values({ userId: user!.id });
  return { user: user!, email, password };
}

/** Crea usuario + sesión (cookie lista para headers) + token Eddie. */
export async function createTestActor(opts: { email?: string; password?: string } = {}) {
  const { user, email, password } = await createTestUser(opts);
  const { token: sessionToken } = await createSession(user.id);
  const { token, record } = await createToken(user.id, { name: "test-token" });
  return {
    user,
    email,
    password,
    cookie: `${SESSION_COOKIE}=${sessionToken}`,
    sessionToken,
    token, // raw pc_...
    tokenId: record.id,
  };
}

type Handler = (req: Request, ctx?: { params: Promise<Record<string, string | string[] | undefined>> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  token?: string;
  cookie?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  /** Origin enviado (por defecto APP_URL cuando hay cookie). */
  origin?: string | null;
  ip?: string;
}

export interface CallResult<T = any> {
  status: number;
  headers: Headers;
  json: T;
  res: Response;
}

/** Invoca un route handler directamente con una Request real. */
export async function call<T = any>(handler: Handler, path: string, opts: CallOptions = {}): Promise<CallResult<T>> {
  const url = new URL(path, "http://localhost:3000");
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.cookie) {
    headers.set("cookie", opts.cookie);
    const origin = opts.origin === undefined ? "http://localhost:3000" : opts.origin;
    if (origin) headers.set("origin", origin);
  }
  if (opts.ip) headers.set("x-forwarded-for", opts.ip);
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers.set("content-type", "application/json");
  }
  const method = opts.method ?? (body !== undefined ? "POST" : "GET");
  const req = new Request(url, { method, headers, body });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.clone().text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* no JSON */
  }
  return { status: res.status, headers: res.headers, json, res };
}
