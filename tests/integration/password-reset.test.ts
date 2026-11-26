import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { requestPasswordReset } from "@/server/auth/password-reset";
import { db } from "@/server/db/client";
import { auditLogs, passwordResetTokens, sessions } from "@/server/db/schema";
import { FORGOT_PASSWORD_MESSAGE } from "@/lib/validation/auth";
import { call, createTestActor, createTestUser, resetDb } from "../helpers";

// Resend falso: el código real (email.ts → `new Resend(key)`) corre completo, sin red.
const mail = vi.hoisted(() => ({
  sent: [] as any[],
  keys: [] as string[],
  fail: null as null | { statusCode: number; message: string },
}));
vi.mock("resend", () => ({
  Resend: class {
    constructor(key: string) {
      mail.keys.push(key);
    }
    emails = {
      send: async (p: unknown) => {
        if (mail.fail) return { data: null, error: { name: "application_error", ...mail.fail } };
        mail.sent.push(p);
        return { data: { id: "em_1" }, error: null };
      },
    };
  },
}));

const KEY = "re_test_abcdefghij1234567890";
const NEW_PW = "una-contraseña-nueva-segura";

beforeEach(async () => {
  await resetDb();
  mail.sent.length = 0;
  mail.keys.length = 0;
  mail.fail = null;
  process.env.RESEND_API_KEY = KEY;
  process.env.EMAIL_FROM = "Agenda <agenda@example.com>";
});
afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  process.env.APP_URL = "http://localhost:3000";
});

let ipN = 0;
const nextIp = () => `10.1.0.${++ipN}`;

const askReset = (email: string, ip = nextIp()) => call(forgot, "/api/auth/forgot-password", { body: { email }, ip });
const doReset = (token: string, password = NEW_PW, ip = nextIp()) =>
  call(reset, "/api/auth/reset-password", { body: { token, password }, ip });
const tokenFromMail = (i = mail.sent.length - 1) => /reset-password\?token=([\w-]+)/.exec(mail.sent[i].text)![1]!;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const audits = (action: string) => db.select().from(auditLogs).where(eq(auditLogs.action, action));

describe("POST /api/auth/forgot-password", () => {
  it("correo existente: genera token hasheado, envía el enlace y no deja el token en audit_logs", async () => {
    const { user, email } = await createTestUser();
    const r = await askReset(email.toUpperCase());
    expect(r.status).toBe(200);
    expect(r.json.message).toBe(FORGOT_PASSWORD_MESSAGE);

    expect(mail.sent).toHaveLength(1);
    expect(mail.keys).toEqual([KEY]);
    expect(mail.sent[0]).toMatchObject({ from: "Agenda <agenda@example.com>", to: email });
    const token = tokenFromMail();
    expect(token).toMatch(/^[\w-]{43}$/); // 32 bytes base64url
    expect(mail.sent[0].html).toContain(`http://localhost:3000/reset-password?token=${token}`);
    expect(mail.sent[0].html).toContain("1 hora");

    const rows = await db.select().from(passwordResetTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(user.id);
    expect(rows[0]!.tokenHash).toBe(sha(token));
    expect(rows[0]!.tokenHash).not.toBe(token);
    expect(rows[0]!.usedAt).toBeNull();
    expect(rows[0]!.requestedIp).toMatch(/^10\.1\.0\./);
    const ttl = rows[0]!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000);

    const all = JSON.stringify(await db.select().from(auditLogs));
    expect(all).not.toContain(token);
    expect(all).not.toContain(sha(token));
    expect(all).not.toContain(KEY);
    const [req] = await audits("auth.password_reset_requested");
    expect(req).toMatchObject({ userId: user.id, actorType: "user", result: "success" });
  });

  it("correo inexistente: mismo status y mensaje, NO envía ni crea token", async () => {
    const { email } = await createTestUser();
    const real = await askReset(email);
    const ghost = await askReset("nadie@test.local");
    expect(ghost.status).toBe(real.status);
    expect(ghost.json.message).toBe(real.json.message);
    expect(ghost.json.success).toBe(true);
    expect(ghost.json.data).toEqual(real.json.data);
    expect(mail.sent).toHaveLength(1); // solo el del correo real
    expect(await db.select().from(passwordResetTokens)).toHaveLength(1);
  });

  it("rate limit: 3/hora por email+IP y 10/hora por IP", async () => {
    const { email } = await createTestUser();
    const ip = "10.9.9.9";
    for (let i = 0; i < 3; i++) expect((await askReset(email, ip)).status).toBe(200);
    const blocked = await askReset(email, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mail.sent).toHaveLength(3);
    // inexistente también se limita igual (sin enumeración)
    for (let i = 0; i < 3; i++) expect((await askReset("x@test.local", "10.9.9.8")).status).toBe(200);
    expect((await askReset("x@test.local", "10.9.9.8")).status).toBe(429);

    // por IP: 10 correos distintos pasan, el 11.º no
    const ip2 = "10.8.8.8";
    for (let i = 0; i < 10; i++) expect((await askReset(`u${i}@test.local`, ip2)).status).toBe(200);
    expect((await askReset("u10@test.local", ip2)).status).toBe(429);
  });

  it("Resend sin configurar: 200 genérico, nada simulado, audit email_failed sin secretos", async () => {
    const { user, email } = await createTestUser();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const r = await askReset(email);
    expect(r.status).toBe(200);
    expect(r.json.message).toBe(FORGOT_PASSWORD_MESSAGE);
    expect(mail.sent).toHaveLength(0);
    expect(await db.select().from(passwordResetTokens)).toHaveLength(0);
    const [f] = await audits("auth.password_reset_email_failed");
    expect(f).toMatchObject({ userId: user.id, actorType: "system", result: "failure" });
    expect((f!.changes as any).reason).toBe("CHANNEL_NOT_CONFIGURED");
    expect(JSON.stringify(f!.changes)).not.toMatch(/re_|token/i);
  });

  it("sin APP_URL no envía y registra el fallo", async () => {
    const { email } = await createTestUser();
    delete process.env.APP_URL;
    const r = await askReset(email);
    expect(r.status).toBe(200);
    expect(mail.sent).toHaveLength(0);
    const [f] = await audits("auth.password_reset_email_failed");
    expect((f!.changes as any).reason).toBe("APP_URL_NOT_CONFIGURED");
  });

  it("error de Resend: 200 genérico, audit sin la API key y el token queda invalidado", async () => {
    const { email } = await createTestUser();
    mail.fail = { statusCode: 500, message: `boom ${KEY}` };
    const r = await askReset(email);
    expect(r.status).toBe(200);
    const [f] = await audits("auth.password_reset_email_failed");
    expect((f!.changes as any).reason).toBe("CHANNEL_TRANSIENT");
    expect(JSON.stringify(f!.changes)).not.toContain(KEY);
    const [row] = await db.select().from(passwordResetTokens);
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("valida el formato del correo", async () => {
    const r = await askReset("no-es-correo");
    expect(r.status).toBe(400);
  });

  it("el servicio acepta un transporte inyectado", async () => {
    const { email } = await createTestUser();
    const sent: any[] = [];
    await requestPasswordReset(email, {
      env: { APP_URL: "https://cal.example.com/", RESEND_API_KEY: KEY, EMAIL_FROM: "a@b.co" },
      transports: { resend: () => ({ emails: { send: async (p) => (sent.push(p), { data: { id: "1" }, error: null }) } }) },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("https://cal.example.com/reset-password?token=");
  });
});

describe("POST /api/auth/reset-password", () => {
  it("token válido cambia la contraseña: la nueva entra y la vieja se rechaza", async () => {
    const { user, email, password } = await createTestUser();
    await askReset(email);
    const token = tokenFromMail();
    const r = await doReset(token);
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/pc_session=;/);
    const [row] = await db.select().from(passwordResetTokens);
    expect(row!.usedAt).not.toBeNull();

    const ok = await call(login, "/api/auth/login", { body: { email, password: NEW_PW }, ip: nextIp() });
    expect(ok.status).toBe(200);
    const bad = await call(login, "/api/auth/login", { body: { email, password }, ip: nextIp() });
    expect(bad.status).toBe(401);

    const [done] = await audits("auth.password_reset_completed");
    expect(done).toMatchObject({ userId: user.id, actorType: "user" });
    const all = JSON.stringify(await db.select().from(auditLogs));
    expect(all).not.toContain(token);
    expect(all).not.toContain(NEW_PW);
  });

  it("el token es de un solo uso", async () => {
    const { email } = await createTestUser();
    await askReset(email);
    const token = tokenFromMail();
    expect((await doReset(token)).status).toBe(200);
    const again = await doReset(token, "otra-contraseña-distinta-1");
    expect(again.status).toBe(400);
    expect(again.json.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    const ok = await call(login, "/api/auth/login", { body: { email, password: NEW_PW }, ip: nextIp() });
    expect(ok.status).toBe(200); // la segunda contraseña no se aplicó
  });

  it("token caducado → INVALID_OR_EXPIRED_TOKEN", async () => {
    const { email, password } = await createTestUser();
    await askReset(email);
    const token = tokenFromMail();
    await db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    const r = await doReset(token);
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    const ok = await call(login, "/api/auth/login", { body: { email, password }, ip: nextIp() });
    expect(ok.status).toBe(200); // contraseña intacta
  });

  it("token inexistente → mismo error genérico y audit failed sin el token", async () => {
    await createTestUser();
    const fake = "A".repeat(43);
    const r = await doReset(fake);
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    const short = await doReset("x");
    expect(short.status).toBe(400);
    expect(short.json.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    expect(short.json.message).toBe(r.json.message);
    const fails = await audits("auth.password_reset_failed");
    expect(fails).toHaveLength(2);
    expect(JSON.stringify(fails)).not.toContain(fake);
  });

  it("un pedido nuevo invalida el anterior", async () => {
    const { email } = await createTestUser();
    await askReset(email);
    await askReset(email);
    expect(mail.sent).toHaveLength(2);
    const first = tokenFromMail(0);
    const second = tokenFromMail(1);
    const old = await doReset(first);
    expect(old.status).toBe(400);
    expect(old.json.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    expect((await doReset(second)).status).toBe(200);
  });

  it("al cambiar la contraseña se destruyen todas las sesiones previas", async () => {
    const a = await createTestActor();
    const extra = await call(login, "/api/auth/login", { body: { email: a.email, password: a.password }, ip: nextIp() });
    expect(extra.status).toBe(200);
    expect((await db.select().from(sessions)).length).toBe(2);
    expect((await call(me, "/api/auth/me", { cookie: a.cookie })).status).toBe(200);

    await askReset(a.email);
    expect((await doReset(tokenFromMail())).status).toBe(200);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await call(me, "/api/auth/me", { cookie: a.cookie })).status).toBe(401);
  });

  it("contraseña corta o demasiado larga rechazada (y el token sigue sirviendo)", async () => {
    const { email } = await createTestUser();
    await askReset(email);
    const token = tokenFromMail();
    const short = await doReset(token, "corta-1234"); // 10
    expect(short.status).toBe(400);
    expect(short.json.error.code).toBe("VALIDATION_ERROR");
    const eleven = await doReset(token, "a".repeat(11));
    expect(eleven.status).toBe(400);
    const long = await doReset(token, "a".repeat(129));
    expect(long.status).toBe(400);
    const edge = await doReset(token, "a".repeat(128));
    expect(edge.status).toBe(200);
  });

  it("rate limit por IP: 10 intentos / 15 min", async () => {
    const ip = "10.7.7.7";
    for (let i = 0; i < 10; i++) expect((await doReset("A".repeat(43), NEW_PW, ip)).status).toBe(400);
    const r = await doReset("A".repeat(43), NEW_PW, ip);
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe("RATE_LIMITED");
  });

  it("canje concurrente: solo una petición gana", async () => {
    const { email } = await createTestUser();
    await askReset(email);
    const token = tokenFromMail();
    const rs = await Promise.all([doReset(token, "contraseña-uno-segura-1"), doReset(token, "contraseña-dos-segura-2")]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});
