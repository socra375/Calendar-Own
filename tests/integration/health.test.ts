import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { GET as health } from "@/app/api/v1/health/route";
import { apiHandler } from "@/server/http/handler";
import { NotFoundError } from "@/server/http/errors";
import { ok, paginated } from "@/server/http/response";
import { call, createTestActor, resetDb } from "../helpers";

beforeEach(resetDb);

describe("health", () => {
  it("es público y devuelve estado, versión, hora, tz e integraciones sin secretos", async () => {
    const r = await call(health, "/api/v1/health");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, error: null, message: "OK", pagination: null });
    expect(r.json.data).toMatchObject({
      status: "ok",
      database: "up",
      timezone: "America/Santo_Domingo",
      integrations: { telegram: false, email: false },
    });
    expect(typeof r.json.data.version).toBe("string");
    expect(Number.isNaN(Date.parse(r.json.data.serverTime))).toBe(false);
    expect(r.headers.get("x-request-id")).toBe(r.json.meta.requestId);
  });
});

describe("envelope y apiHandler", () => {
  const echo = apiHandler(
    { auth: "any", query: z.object({ n: z.coerce.number().int().min(1) }), body: z.object({ title: z.string().min(1) }), params: z.object({ id: z.uuid() }) },
    (ctx) => ok({ n: ctx.query.n, title: ctx.body.title, id: ctx.params.id, actor: ctx.actor.type }),
  );
  const boom = apiHandler({ auth: "public" }, () => {
    throw new Error("secreto interno");
  });
  const nf = apiHandler({ auth: "public" }, () => {
    throw new NotFoundError("Evento no encontrado");
  });
  const list = apiHandler({ auth: "public" }, () => paginated([1, 2], { page: 2, pageSize: 2, total: 5 }));

  it("errores de validación: 400 con envelope y detalles por campo", async () => {
    const a = await createTestActor();
    const r = await call(echo, "/x", {
      method: "POST",
      token: a.token,
      query: { n: 0 },
      body: { title: "" },
      params: { id: "no-uuid" },
    });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ success: false, data: null, error: { code: "VALIDATION_ERROR" } });
    expect(typeof r.json.message).toBe("string");
    expect(r.json.meta.requestId).toBeTruthy();
  });

  it("camino feliz con params/query/body tipados", async () => {
    const a = await createTestActor();
    const id = crypto.randomUUID();
    const r = await call(echo, "/x", { method: "POST", token: a.token, query: { n: "3" }, body: { title: "Hola" }, params: { id } });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ n: 3, title: "Hola", id, actor: "eddie" });
  });

  it("JSON malformado -> 400", async () => {
    const a = await createTestActor();
    const req = new Request("http://localhost:3000/x?n=1", {
      method: "POST",
      headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" },
      body: "{no json",
    });
    const res = await echo(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("errores desconocidos -> 500 INTERNAL_ERROR sin filtrar el mensaje", async () => {
    const r = await call(boom, "/x");
    expect(r.status).toBe(500);
    expect(r.json.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(r.json)).not.toContain("secreto interno");
  });

  it("AppError -> status y código propios; paginación calcula totalPages", async () => {
    const r = await call(nf, "/x");
    expect(r.status).toBe(404);
    expect(r.json).toMatchObject({ success: false, error: { code: "NOT_FOUND" }, message: "Evento no encontrado" });
    const p = await call(list, "/x");
    expect(p.json.pagination).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
  });

  it("rate limit por actor (configurable) -> 429", async () => {
    const a = await createTestActor();
    const limited = apiHandler({ auth: "token", rateLimit: { limit: 2, windowSeconds: 60 } }, () => ok(null));
    expect((await call(limited, "/x", { token: a.token })).status).toBe(200);
    expect((await call(limited, "/x", { token: a.token })).status).toBe(200);
    const r = await call(limited, "/x", { token: a.token });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe("RATE_LIMITED");
  });
});
