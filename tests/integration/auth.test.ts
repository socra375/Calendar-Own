import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { db } from "@/server/db/client";
import { auditLogs, sessions } from "@/server/db/schema";
import { revokeToken, rotateToken } from "@/server/auth/tokens";
import { call, createTestActor, resetDb } from "../helpers";

beforeEach(resetDb);

describe("login", () => {
  it("login correcto crea sesión, cookie httpOnly y audit", async () => {
    const a = await createTestActor();
    const r = await call(login, "/api/auth/login", { body: { email: a.email.toUpperCase(), password: a.password } });
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(r.json.data.user.email).toBe(a.email);
    expect(r.json.data.user.passwordHash).toBeUndefined();
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^pc_session=[\w-]{40,}/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=25\d{5}/);
    // en BD solo hay hash (64 hex), no el token
    const rows = await db.select().from(sessions);
    const rawToken = /pc_session=([^;]+)/.exec(cookie)![1]!;
    expect(rows.some((s) => s.tokenHash === rawToken)).toBe(false);
    expect(rows.every((s) => /^[0-9a-f]{64}$/.test(s.tokenHash))).toBe(true);
    const logs = await db.select().from(auditLogs);
    expect(logs.some((l) => l.action === "auth.login" && l.result === "success")).toBe(true);
    // la cookie sirve en /me
    const m = await call(me, "/api/auth/me", { cookie: `pc_session=${rawToken}` });
    expect(m.status).toBe(200);
    expect(m.json.data.actor.type).toBe("user");
  });

  it("login incorrecto devuelve mensaje genérico 401 (usuario inexistente y contraseña errónea igual)", async () => {
    const a = await createTestActor();
    const bad = await call(login, "/api/auth/login", { body: { email: a.email, password: "nope" } });
    const ghost = await call(login, "/api/auth/login", { body: { email: "ghost@test.local", password: "nope" } });
    expect(bad.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(bad.json.message).toBe(ghost.json.message);
    expect(bad.json.error.code).toBe("UNAUTHORIZED");
    expect(bad.headers.get("set-cookie")).toBeNull();
  });

  it("body inválido -> VALIDATION_ERROR", async () => {
    const r = await call(login, "/api/auth/login", { body: { email: "x" } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(r.json.error.details)).toBe(true);
  });

  it("rate limit: el 6.º intento en 15 min devuelve 429 con Retry-After, incluso con la clave correcta", async () => {
    const a = await createTestActor();
    for (let i = 0; i < 5; i++) {
      const r = await call(login, "/api/auth/login", { body: { email: a.email, password: "wrong" }, ip: "9.9.9.9" });
      expect(r.status).toBe(401);
    }
    const blocked = await call(login, "/api/auth/login", { body: { email: a.email, password: a.password }, ip: "9.9.9.9" });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // otra IP no está bloqueada
    const other = await call(login, "/api/auth/login", { body: { email: a.email, password: a.password }, ip: "8.8.8.8" });
    expect(other.status).toBe(200);
  });

  it("logout destruye la sesión y exige Origin válido (CSRF)", async () => {
    const a = await createTestActor();
    const csrf = await call(logout, "/api/auth/logout", { method: "POST", cookie: a.cookie, origin: "https://evil.example" });
    expect(csrf.status).toBe(403);
    const noOrigin = await call(logout, "/api/auth/logout", { method: "POST", cookie: a.cookie, origin: null });
    expect(noOrigin.status).toBe(403);
    const good = await call(logout, "/api/auth/logout", { method: "POST", cookie: a.cookie });
    expect(good.status).toBe(200);
    expect(good.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    const after = await call(me, "/api/auth/me", { cookie: a.cookie });
    expect(after.status).toBe(401);
  });
});

describe("tokens Eddie", () => {
  it("token válido autentica como eddie; sin credenciales 401", async () => {
    const a = await createTestActor();
    const ok = await call(me, "/api/auth/me", { token: a.token });
    expect(ok.status).toBe(200);
    expect(ok.json.data.actor).toEqual({ type: "eddie", tokenId: a.tokenId });
    const none = await call(me, "/api/auth/me");
    expect(none.status).toBe(401);
    expect(none.json.error.code).toBe("UNAUTHORIZED");
    const garbage = await call(me, "/api/auth/me", { token: "pc_" + "x".repeat(43) });
    expect(garbage.status).toBe(401);
  });

  it("token revocado deja de funcionar; rotado invalida el anterior", async () => {
    const a = await createTestActor();
    await revokeToken(a.user.id, a.tokenId);
    expect((await call(me, "/api/auth/me", { token: a.token })).status).toBe(401);

    const b = await createTestActor({ email: "b@test.local" });
    const rotated = await rotateToken(b.user.id, b.tokenId);
    expect((await call(me, "/api/auth/me", { token: b.token })).status).toBe(401);
    expect((await call(me, "/api/auth/me", { token: rotated.token })).status).toBe(200);
    expect(rotated.record.rotatedFromId).toBe(b.tokenId);
  });

  it("token con cookie-only endpoint /logout (auth session) es rechazado", async () => {
    const a = await createTestActor();
    const r = await call(logout, "/api/auth/logout", { method: "POST", token: a.token });
    expect(r.status).toBe(401);
  });
});
