import { eq, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listNotifications } from "@/app/api/v1/notifications/route";
import { POST as testNotification } from "@/app/api/v1/notifications/test/route";
import { db } from "@/server/db/client";
import { rateLimits } from "@/server/db/schema";
import { apiHandler } from "@/server/http/handler";
import { ok } from "@/server/http/response";
import { call, createTestActor, resetDb } from "../helpers";

let a: Awaited<ReturnType<typeof createTestActor>>;

beforeEach(async () => {
  await resetDb();
  a = await createTestActor();
  // Reloj fijo a mitad de ventana de 60 s: evita cruzar el límite de la ventana durante el test.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-01-15T15:00:30.000Z"));
});
afterEach(() => vi.useRealTimers());

const general = () => call(listNotifications, "/api/v1/notifications", { token: a.token });
const probe = () => call(testNotification, "/api/v1/notifications/test", { token: a.token, body: { channel: "internal" } });
const windowStart = new Date("2030-01-15T15:00:00.000Z");

describe("rate limit: contador propio por ruta", () => {
  it("agotar /notifications/test (10/min) no consume ni bloquea el límite general", async () => {
    for (let i = 0; i < 10; i++) expect((await probe()).status).toBe(201);
    const blocked = await probe();
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("RATE_LIMITED");
    expect(blocked.headers.get("retry-after")).toBe("30");

    // el contador general sigue sin tocar y la API normal responde
    expect((await general()).status).toBe(200);
    const rows = await db.select().from(rateLimits);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.count]));
    expect(byKey[`api:${a.tokenId}`]).toBe(1); // solo la llamada general de arriba
    expect(byKey[`api:${a.tokenId}:/api/v1/notifications/test`]).toBe(11);
  });

  it("agotar el límite general (120/min) no bloquea /notifications/test", async () => {
    await db.insert(rateLimits).values({ key: `api:${a.tokenId}`, windowStart, count: 120 });
    expect((await general()).status).toBe(429); // 121.ª llamada
    const r = await probe();
    expect(r.status).toBe(201);
    const [own] = await db.select().from(rateLimits).where(eq(rateLimits.key, `api:${a.tokenId}:/api/v1/notifications/test`));
    expect(own!.count).toBe(1);
  });

  it("las rutas con límite general comparten un único contador por actor", async () => {
    await general();
    await call(apiHandler({ auth: "token" }, () => ok(null)), "/otra/ruta", { token: a.token });
    const rows = await db.select().from(rateLimits).where(like(rateLimits.key, "api:%"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: `api:${a.tokenId}`, count: 2 });
  });

  it("errores no controlados no filtran params SQL en el log ni en la respuesta", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = apiHandler({ auth: "token" }, () => {
        throw Object.assign(new Error("Failed query: select 1\nparams: secret@example.com,SECRETHASH"), { code: "XX000" });
      });
      const r = await call(boom, "/x", { token: a.token });
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.json)).not.toContain("secret@example.com");
      const logged = spy.mock.calls.flat().map(String).join("\n");
      expect(logged).toContain("XX000");
      expect(logged).not.toContain("secret@example.com");
      expect(logged).not.toContain("SECRETHASH");
    } finally {
      spy.mockRestore();
    }
  });
});
