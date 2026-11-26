import { createServer, type Server } from "node:http";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/reminders/route";
import { GET as listNotifications } from "@/app/api/v1/notifications/route";
import { PATCH as patchNotification } from "@/app/api/v1/notifications/[id]/route";
import { POST as testNotification } from "@/app/api/v1/notifications/test/route";
import { db } from "@/server/db/client";
import {
  auditLogs,
  eventExceptions,
  eventRecurrence,
  events,
  notifications,
  reminders,
  specialDates,
  tasks,
  userSettings,
} from "@/server/db/schema";
import { applyDefaultReminders } from "@/server/notifications/defaults";
import { processReminders } from "@/server/notifications/processor";
import type { ResendLike } from "@/server/notifications/channels/types";
import { call, createTestActor, createTestUser, resetDb } from "../helpers";

const NOW = new Date("2030-01-15T15:00:00.000Z"); // 11:00 en America/Santo_Domingo (UTC-4)
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const at = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

const TOKEN = "123456789:AAFakeTelegramTokenForTestsOnly_abcdef";
const RESEND_KEY = "re_fakeResendKey1234567890";

// ---- servidor Telegram falso -------------------------------------------------------------
interface Hit {
  url: string;
  body: any;
}
let server: Server;
let baseUrl = "";
let hits: Hit[] = [];
let respond: () => { status: number; body: unknown } = () => ({ status: 200, body: { ok: true, result: {} } });

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hits.push({ url: req.url ?? "", body: raw ? JSON.parse(raw) : null });
      const r = respond();
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const tgEnv = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "777" };
const tg = () => ({ env: tgEnv, transports: { telegramBaseUrl: baseUrl } });

beforeEach(async () => {
  await resetDb();
  hits = [];
  respond = () => ({ status: 200, body: { ok: true, result: {} } });
});

// ---- helpers de datos --------------------------------------------------------------------
async function mkEvent(userId: string, startAt: Date, over: Partial<typeof events.$inferInsert> = {}) {
  const [e] = await db
    .insert(events)
    .values({ userId, title: "Reunión", startAt, endAt: at(startAt, 30), ...over })
    .returning();
  return e!;
}
async function mkReminder(
  userId: string,
  target: { eventId?: string; taskId?: string; specialDateId?: string },
  offsetMinutes = 0,
  channel: "internal" | "telegram" | "email" = "internal",
) {
  const targetType = target.eventId ? "event" : target.taskId ? "task" : "special_date";
  const [r] = await db.insert(reminders).values({ userId, targetType, ...target, offsetMinutes, channel }).returning();
  return r!;
}
const allNotifs = () => db.select().from(notifications).orderBy(notifications.scheduledFor);
const sumRuns = (rs: Awaited<ReturnType<typeof processReminders>>[]) => ({
  materialized: rs.reduce((a, r) => a + r.materialized, 0),
  sent: rs.reduce((a, r) => a + r.sent, 0),
  claimed: rs.reduce((a, r) => a + r.claimed, 0),
});

describe("materialización e idempotencia", () => {
  it("crea el disparo una sola vez aunque el cron corra repetidamente", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(30));
    await mkReminder(user.id, { eventId: ev.id }, 15);
    const r1 = await processReminders({ now: NOW });
    const r2 = await processReminders({ now: NOW });
    expect(r1.materialized).toBe(1);
    expect(r1.claimed).toBe(0); // aún no es hora (disparo a +15 min)
    expect(r2.materialized).toBe(0);
    const rows = await allNotifs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.scheduledFor).toEqual(min(15));
    expect(rows[0]!.status).toBe("pending");

    const r3 = await processReminders({ now: min(16) });
    expect(r3).toMatchObject({ sent: 1, claimed: 1, materialized: 0 });
    const [done] = await allNotifs();
    expect(done).toMatchObject({ status: "sent", attempts: 1, lastError: null });
    expect(done!.sentAt).toEqual(min(16));
    expect(done!.title).toContain("Reunión");
    expect(done!.body).toContain("15 minutos");
    // Una ejecución posterior no reenvía
    expect((await processReminders({ now: min(17) })).sent).toBe(0);
  });

  it("no duplica ni envía dos veces con ejecuciones en paralelo", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(5));
    await mkReminder(user.id, { eventId: ev.id }, 0);
    // 12 eventos más para repartir lotes entre ejecutores
    for (let i = 0; i < 12; i++) await mkReminder(user.id, { eventId: (await mkEvent(user.id, min(1 + i))).id }, 0);
    const runs = await Promise.all(Array.from({ length: 5 }, () => processReminders({ now: min(30) })));
    const t = sumRuns(runs);
    expect(t.materialized).toBe(13);
    expect(t.sent).toBe(13);
    expect(t.claimed).toBe(13);
    const rows = await allNotifs();
    expect(rows).toHaveLength(13);
    expect(rows.every((r) => r.status === "sent" && r.attempts === 1)).toBe(true);
  });

  it("calcula bien los offsets 0, 5, 15, 30, 60, 1440 y personalizado", async () => {
    const { user } = await createTestUser();
    const start = min(23 * 60 + 30); // dentro del horizonte de 24 h
    const ev = await mkEvent(user.id, start);
    const offsets = [0, 5, 15, 30, 60, 90, 1440];
    for (const o of offsets) await mkReminder(user.id, { eventId: ev.id }, o);
    await processReminders({ now: NOW });
    const rows = await allNotifs();
    expect(rows).toHaveLength(offsets.length);
    const scheduled = rows.map((r) => r.scheduledFor.getTime()).sort();
    expect(scheduled).toEqual(offsets.map((o) => at(start, -o).getTime()).sort());
  });

  it("no materializa lo fuera de la ventana [now-6h, now+24h]", async () => {
    const { user } = await createTestUser();
    const far = await mkEvent(user.id, min(26 * 60));
    const past = await mkEvent(user.id, min(-7 * 60));
    await mkReminder(user.id, { eventId: far.id }, 0);
    await mkReminder(user.id, { eventId: past.id }, 0);
    expect((await processReminders({ now: NOW })).materialized).toBe(0);
  });

  it("recordatorios inactivos no disparan", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(1));
    const r = await mkReminder(user.id, { eventId: ev.id }, 0);
    await db.update(reminders).set({ isActive: false }).where(eq(reminders.id, r.id));
    expect(await processReminders({ now: NOW })).toMatchObject({ materialized: 0, sent: 0 });
  });
});

describe("recurrencia", () => {
  it("expande la serie y omite ocurrencias con excepción cancelada", async () => {
    const { user } = await createTestUser();
    // Serie diaria (las reglas sub-diarias no son válidas): ocurrencias en -60, +1380 (cancelada) y +2820 min.
    const ev = await mkEvent(user.id, min(-60));
    await db.insert(eventRecurrence).values({ eventId: ev.id, rrule: "FREQ=DAILY;COUNT=3" });
    await db.insert(eventExceptions).values({ eventId: ev.id, occurrenceKey: min(1380).toISOString(), kind: "cancelled" });
    await mkReminder(user.id, { eventId: ev.id }, 0);
    await processReminders({ now: NOW });
    await processReminders({ now: min(1440) }); // la ventana ahora cubre la 2.ª (cancelada) y la 3.ª
    const keys = (await allNotifs()).map((n) => n.occurrenceKey);
    expect(keys).toEqual([min(-60), min(2820)].map((d) => d.toISOString()));
  });

  it("cancela una notificación pendiente cuando después se cancela esa ocurrencia", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-60));
    await db.insert(eventRecurrence).values({ eventId: ev.id, rrule: "FREQ=DAILY;COUNT=2" });
    await mkReminder(user.id, { eventId: ev.id }, 0);
    await processReminders({ now: NOW }); // 1.ª enviada, 2.ª (+1380 min) pendiente
    await db.insert(eventExceptions).values({ eventId: ev.id, occurrenceKey: min(1380).toISOString(), kind: "cancelled" });
    const r = await processReminders({ now: NOW });
    expect(r.cancelled).toBe(1);
    const rows = await allNotifs();
    expect(rows.map((n) => n.status)).toEqual(["sent", "cancelled"]);
  });

  it("aplica la zona horaria del evento (DTSTART local) en series diarias", async () => {
    const { user } = await createTestUser();
    // 09:00 hora de Santo Domingo = 13:00Z; la regla diaria debe seguir en 13:00Z (sin DST)
    const ev = await mkEvent(user.id, new Date("2030-01-15T13:00:00Z"), { timezone: "America/Santo_Domingo" });
    await db.insert(eventRecurrence).values({ eventId: ev.id, rrule: "FREQ=DAILY;COUNT=3" });
    await mkReminder(user.id, { eventId: ev.id }, 0);
    await processReminders({ now: new Date("2030-01-15T12:00:00Z") });
    expect((await allNotifs()).map((n) => n.occurrenceKey)).toEqual(["2030-01-15T13:00:00.000Z"]);
  });
});

describe("tareas y fechas especiales", () => {
  it("notifica tareas pendientes y cancela si se completan", async () => {
    const { user } = await createTestUser();
    const [t] = await db.insert(tasks).values({ userId: user.id, title: "Pagar luz", dueAt: min(60) }).returning();
    await mkReminder(user.id, { taskId: t!.id }, 30);
    await processReminders({ now: NOW });
    const [n] = await allNotifs();
    expect(n!.scheduledFor).toEqual(min(30));
    expect(n!.body).toContain("Vence en 30 minutos");
    await db.update(tasks).set({ status: "completed", completedAt: NOW }).where(eq(tasks.id, t!.id));
    expect((await processReminders({ now: NOW })).cancelled).toBe(1);
    expect((await allNotifs())[0]!.status).toBe("cancelled");
  });

  it("tareas completadas no generan disparos", async () => {
    const { user } = await createTestUser();
    const [t] = await db.insert(tasks).values({ userId: user.id, title: "x", dueAt: min(10), status: "completed" }).returning();
    await mkReminder(user.id, { taskId: t!.id }, 0);
    expect((await processReminders({ now: NOW })).materialized).toBe(0);
  });

  it("recordatorio anual de fecha especial con 1 día de anticipación", async () => {
    const { user } = await createTestUser();
    const [sd] = await db
      .insert(specialDates)
      .values({ userId: user.id, title: "Cumple Ana", type: "birthday", date: "1990-01-16", recursYearly: true })
      .returning();
    await mkReminder(user.id, { specialDateId: sd!.id }, 1440);
    // referencia = 08:00 local (12:00Z) del 16-ene; -1 día = 15-ene 12:00Z <= now
    const r = await processReminders({ now: NOW });
    expect(r.sent).toBe(1);
    const [n] = await allNotifs();
    expect(n!.occurrenceKey).toBe("2030-01-16");
    expect(n!.scheduledFor).toEqual(new Date("2030-01-15T12:00:00Z"));
    expect(n!.body).toContain("Faltan 1 día");
  });

  it("29-feb anual se celebra el 28-feb en años no bisiestos", async () => {
    const { user } = await createTestUser();
    const [sd] = await db
      .insert(specialDates)
      .values({ userId: user.id, title: "Bisiesto", date: "2000-02-29", recursYearly: true })
      .returning();
    await mkReminder(user.id, { specialDateId: sd!.id }, 0);
    await processReminders({ now: new Date("2031-02-28T13:00:00Z") });
    expect((await allNotifs()).map((n) => n.occurrenceKey)).toEqual(["2031-02-28"]);
  });

  it("fecha especial no recurrente solo dispara en su año", async () => {
    const { user } = await createTestUser();
    const [sd] = await db.insert(specialDates).values({ userId: user.id, title: "Boda", date: "2029-01-15" }).returning();
    await mkReminder(user.id, { specialDateId: sd!.id }, 0);
    expect((await processReminders({ now: NOW })).materialized).toBe(0);
  });
});

describe("obsolescencia y antigüedad", () => {
  it("cancela disparos de más de 6 h sin enviarlos", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-8 * 60));
    const r = await mkReminder(user.id, { eventId: ev.id }, 0);
    await db.insert(notifications).values({
      userId: user.id,
      reminderId: r.id,
      channel: "internal",
      targetType: "event",
      targetId: ev.id,
      occurrenceKey: ev.startAt!.toISOString(),
      scheduledFor: min(-7 * 60),
      nextAttemptAt: min(-7 * 60),
      title: "viejo",
    });
    const res = await processReminders({ now: NOW });
    expect(res).toMatchObject({ cancelled: 1, sent: 0, claimed: 0 });
    const [n] = await allNotifs();
    expect(n!.status).toBe("cancelled");
    expect(n!.lastError).toMatch(/^STALE/);
  });

  it("un disparo de hace 5 h todavía se envía", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-5 * 60));
    await mkReminder(user.id, { eventId: ev.id }, 0);
    expect((await processReminders({ now: NOW })).sent).toBe(1);
  });

  it("cancela pendientes de eventos cancelados, borrados o movidos", async () => {
    const { user } = await createTestUser();
    const a = await mkEvent(user.id, min(60), { title: "A" });
    const b = await mkEvent(user.id, min(61), { title: "B" });
    const c = await mkEvent(user.id, min(62), { title: "C" });
    const d = await mkEvent(user.id, min(63), { title: "D" });
    for (const e of [a, b, c, d]) await mkReminder(user.id, { eventId: e.id }, 0);
    await processReminders({ now: NOW });
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, a.id));
    await db.update(events).set({ deletedAt: NOW }).where(eq(events.id, b.id));
    await db.update(events).set({ startAt: min(90), endAt: min(120) }).where(eq(events.id, c.id));
    const r = await processReminders({ now: NOW });
    expect(r.cancelled).toBe(3);
    const rows = await allNotifs();
    expect(rows.filter((n) => n.status === "cancelled")).toHaveLength(3);
    expect(rows.filter((n) => n.status === "pending")).toHaveLength(2); // D original + C reprogramado
  });

  it("recupera notificaciones 'processing' atascadas > 10 min", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-1));
    const r = await mkReminder(user.id, { eventId: ev.id }, 0);
    await db.insert(notifications).values({
      userId: user.id,
      reminderId: r.id,
      channel: "internal",
      targetType: "event",
      targetId: ev.id,
      occurrenceKey: ev.startAt!.toISOString(),
      scheduledFor: min(-1),
      nextAttemptAt: min(-1),
      status: "processing",
      attempts: 1,
      title: "atascada",
      updatedAt: min(-11),
    });
    const fresh = await processReminders({ now: min(-5) }); // 6 min de antigüedad: no se toca
    expect(fresh.sent + fresh.retried).toBe(0);
    const res = await processReminders({ now: NOW });
    expect(res.retried).toBe(1);
    expect(res.sent).toBe(1);
    expect((await allNotifs())[0]).toMatchObject({ status: "sent", attempts: 3 });
  });
});

describe("canales", () => {
  it("telegram: payload correcto, HTML escapado, chat_id del usuario prioritario y sin secretos en BD", async () => {
    const { user } = await createTestUser();
    await db.update(userSettings).set({ telegramChatId: "999" }).where(eq(userSettings.userId, user.id));
    const ev = await mkEvent(user.id, min(10), { title: "Tom & <Jerry>", location: "Sala <1>" });
    await mkReminder(user.id, { eventId: ev.id }, 10, "telegram");
    const r = await processReminders({ now: NOW, ...tg() });
    expect(r.sent).toBe(1);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.url).toBe(`/bot${TOKEN}/sendMessage`);
    expect(hits[0]!.body.chat_id).toBe("999");
    expect(hits[0]!.body.parse_mode).toBe("HTML");
    expect(hits[0]!.body.text).toContain("<b>Recordatorio: Tom &amp; &lt;Jerry&gt;</b>");
    expect(hits[0]!.body.text).toContain("Sala &lt;1&gt;");
    const [n] = await allNotifs();
    expect(JSON.stringify(n)).not.toContain(TOKEN);
  });

  it("telegram usa TELEGRAM_CHAT_ID si el usuario no tiene chat propio", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-1));
    await mkReminder(user.id, { eventId: ev.id }, 0, "telegram");
    await processReminders({ now: NOW, ...tg() });
    expect(hits[0]!.body.chat_id).toBe("777");
  });

  it("reintentos con backoff 1/5/15/60 min y fallo definitivo al 5.º intento; el token nunca aparece", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-1));
    await mkReminder(user.id, { eventId: ev.id }, 0, "telegram");
    // El servidor falso filtra la URL con el token en el mensaje (peor caso)
    respond = () => ({ status: 500, body: { ok: false, description: `boom at /bot${TOKEN}/sendMessage` } });
    const times = [0, 1, 6, 21, 81].map((m) => min(m));
    const expectedNext = [1, 5, 15, 60];
    for (let i = 0; i < 5; i++) {
      const res = await processReminders({ now: times[i]!, ...tg() });
      expect(res.claimed).toBe(1);
      const [n] = await allNotifs();
      expect(n!.attempts).toBe(i + 1);
      if (i < 4) {
        expect(res.retried).toBe(1);
        expect(n!.status).toBe("pending");
        expect(n!.nextAttemptAt).toEqual(at(times[i]!, expectedNext[i]!));
        // un instante antes de next_attempt_at no se reclama
        const early = await processReminders({ now: at(times[i]!, expectedNext[i]! - 0.5), ...tg() });
        expect(early.claimed).toBe(0);
      } else {
        expect(res.failed).toBe(1);
        expect(n!.status).toBe("failed");
      }
      expect(n!.lastError).toContain("CHANNEL_TRANSIENT");
      expect(n!.lastError).not.toContain(TOKEN);
    }
    expect(hits).toHaveLength(5);
    // No se vuelve a intentar
    expect((await processReminders({ now: min(500), ...tg() })).claimed).toBe(0);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "notification.failed"));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actorType).toBe("system");
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
  });

  it("telegram 429 respeta retry_after", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-1));
    await mkReminder(user.id, { eventId: ev.id }, 0, "telegram");
    respond = () => ({ status: 429, body: { ok: false, description: "Too Many Requests", parameters: { retry_after: 120 } } });
    const res = await processReminders({ now: NOW, ...tg() });
    expect(res.retried).toBe(1);
    const [n] = await allNotifs();
    expect(n!.nextAttemptAt).toEqual(new Date(NOW.getTime() + 120_000));
    expect(n!.lastError).toContain("CHANNEL_RATE_LIMITED");
  });

  it("telegram 4xx (chat inexistente) falla de inmediato sin reintentos", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-1));
    await mkReminder(user.id, { eventId: ev.id }, 0, "telegram");
    respond = () => ({ status: 400, body: { ok: false, description: "Bad Request: chat not found" } });
    const res = await processReminders({ now: NOW, ...tg() });
    expect(res).toMatchObject({ failed: 1, retried: 0 });
    const [n] = await allNotifs();
    expect(n).toMatchObject({ status: "failed", attempts: 1 });
    expect(n!.lastError).toContain("CHANNEL_REJECTED");
  });

  it("error de red hacia Telegram no filtra el token", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-1));
    await mkReminder(user.id, { eventId: ev.id }, 0, "telegram");
    const failingFetch = (async (input: RequestInfo | URL) => {
      throw new Error(`connect ECONNREFUSED for ${String(input)}`);
    }) as typeof fetch;
    await processReminders({ now: NOW, env: tgEnv, transports: { fetch: failingFetch } });
    const [n] = await allNotifs();
    expect(n!.status).toBe("pending");
    expect(n!.lastError).toContain("ECONNREFUSED");
    expect(n!.lastError).not.toContain(TOKEN);
  });

  it("email: envía con Resend (stub), usa EMAIL_FROM y destino del usuario; escapa HTML", async () => {
    const { user } = await createTestUser();
    await db.update(userSettings).set({ notificationEmail: "yo@example.com" }).where(eq(userSettings.userId, user.id));
    const ev = await mkEvent(user.id, min(30), { title: "<script>x</script>" });
    await mkReminder(user.id, { eventId: ev.id }, 30, "email");
    const sent: any[] = [];
    const keys: string[] = [];
    const resend = (k: string): ResendLike => {
      keys.push(k);
      return { emails: { send: async (p) => (sent.push(p), { data: { id: "em_1" }, error: null }) } };
    };
    const res = await processReminders({
      now: NOW,
      env: { RESEND_API_KEY: RESEND_KEY, EMAIL_FROM: "Agenda <agenda@example.com>", NOTIFICATION_EMAIL_TO: "otro@example.com" },
      transports: { resend },
    });
    expect(res.sent).toBe(1);
    expect(keys).toEqual([RESEND_KEY]);
    expect(sent[0]).toMatchObject({ from: "Agenda <agenda@example.com>", to: "yo@example.com" });
    expect(sent[0].subject).toContain("<script>");
    expect(sent[0].html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(sent[0].html).not.toContain("<script>");
  });

  it("email: error del proveedor se registra sin la API key", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-1));
    await mkReminder(user.id, { eventId: ev.id }, 0, "email");
    const resend = (): ResendLike => ({
      emails: { send: async () => ({ data: null, error: { name: "application_error", message: `bad key ${RESEND_KEY}`, statusCode: 500 } }) },
    });
    await processReminders({
      now: NOW,
      env: { RESEND_API_KEY: RESEND_KEY, EMAIL_FROM: "a@b.co", NOTIFICATION_EMAIL_TO: "c@d.co" },
      transports: { resend },
    });
    const [n] = await allNotifs();
    expect(n!.status).toBe("pending");
    expect(n!.lastError).toContain("CHANNEL_TRANSIENT");
    expect(n!.lastError).not.toContain(RESEND_KEY);
  });

  it("canal sin credenciales: failed con CHANNEL_NOT_CONFIGURED, sin envío simulado ni reintentos", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(-1));
    await mkReminder(user.id, { eventId: ev.id }, 0, "telegram");
    await mkReminder(user.id, { eventId: ev.id }, 0, "email");
    await mkReminder(user.id, { eventId: ev.id }, 0, "internal");
    const res = await processReminders({ now: NOW, env: {} });
    expect(res).toMatchObject({ sent: 1, failed: 2 });
    const rows = await allNotifs();
    for (const n of rows.filter((r) => r.channel !== "internal")) {
      expect(n.status).toBe("failed");
      expect(n.attempts).toBe(1);
      expect(n.sentAt).toBeNull();
      expect(n.lastError).toMatch(/^CHANNEL_NOT_CONFIGURED/);
    }
    expect(rows.find((r) => r.channel === "internal")!.status).toBe("sent");
  });
});

describe("aislamiento por usuario", () => {
  it("cada usuario solo recibe/ve lo suyo y no puede marcar lo ajeno", async () => {
    const a = await createTestActor({ email: "a@test.local" });
    const b = await createTestActor({ email: "b@test.local" });
    const ev = await mkEvent(a.user.id, min(-1));
    await mkReminder(a.user.id, { eventId: ev.id }, 0);
    await processReminders({ now: NOW });
    const rows = await allNotifs();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(a.user.id);

    const la = await call(listNotifications, "/api/v1/notifications", { token: a.token });
    const lb = await call(listNotifications, "/api/v1/notifications", { token: b.token });
    expect(la.json.pagination.total).toBe(1);
    expect(lb.json.pagination.total).toBe(0);
    const p = await call(patchNotification, "/api/v1/notifications/x", {
      method: "PATCH",
      token: b.token,
      params: { id: rows[0]!.id },
      body: { read: true },
    });
    expect(p.status).toBe(404);
  });
});

describe("cron /api/cron/reminders", () => {
  it("rechaza sin credenciales o con secreto incorrecto (GET y POST), sin usar sesión", async () => {
    const actor = await createTestActor();
    for (const h of [cronGet, cronPost]) {
      const none = await call(h, "/api/cron/reminders", { method: h === cronGet ? "GET" : "POST" });
      expect(none.status).toBe(401);
      const bad = await call(h, "/api/cron/reminders", { method: h === cronGet ? "GET" : "POST", token: "otro-secreto" });
      expect(bad.status).toBe(401);
      expect(bad.json).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
      // ni cookie de sesión ni token de Eddie sirven
      const cookie = await call(h, "/api/cron/reminders", { method: h === cronGet ? "GET" : "POST", cookie: actor.cookie });
      expect(cookie.status).toBe(401);
      const eddie = await call(h, "/api/cron/reminders", { method: h === cronGet ? "GET" : "POST", token: actor.token });
      expect(eddie.status).toBe(401);
    }
  });

  it("sin CRON_SECRET configurado responde 503", async () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const r = await call(cronGet, "/api/cron/reminders", { token: "lo-que-sea" });
      expect(r.status).toBe(503);
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });

  it("con el secreto correcto procesa, devuelve el resumen y audita como system", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, new Date(Date.now() - 60_000));
    await mkReminder(user.id, { eventId: ev.id }, 0);
    const r = await call(cronGet, "/api/cron/reminders", { token: "test-cron-secret" });
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(r.json.data).toMatchObject({ materialized: 1, claimed: 1, sent: 1, failed: 0, retried: 0, cancelled: 0 });
    expect(typeof r.json.data.durationMs).toBe("number");
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "reminders.process"));
    expect(log).toMatchObject({ actorType: "system", result: "success" });
    // segunda ejecución (POST): idempotente
    const r2 = await call(cronPost, "/api/cron/reminders", { method: "POST", token: "test-cron-secret" });
    expect(r2.json.data).toMatchObject({ materialized: 0, sent: 0 });
  });
});

describe("API /notifications", () => {
  async function seed(userId: string) {
    const base = { userId, channel: "internal" as const, targetType: "event" as const, scheduledFor: NOW, nextAttemptAt: NOW };
    const mk = (i: number, extra: Partial<typeof notifications.$inferInsert>) =>
      ({ ...base, targetId: crypto.randomUUID(), occurrenceKey: `k${i}`, title: `N${i}`, scheduledFor: min(i), ...extra }) as typeof notifications.$inferInsert;
    await db.insert(notifications).values([
      mk(1, { status: "sent" }),
      mk(2, { status: "sent", readAt: NOW }),
      mk(3, { status: "failed", lastError: "CHANNEL_NOT_CONFIGURED: x" }),
      mk(4, { status: "pending" }),
      mk(5, { status: "sent", channel: "email" }),
    ]);
  }

  it("lista paginada con filtros status/unread/channel y requiere auth", async () => {
    const a = await createTestActor();
    await seed(a.user.id);
    expect((await call(listNotifications, "/api/v1/notifications")).status).toBe(401);
    const all = await call(listNotifications, "/api/v1/notifications", { token: a.token, query: { pageSize: 2, page: 2 } });
    expect(all.json.pagination).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(all.json.data.map((n: any) => n.title)).toEqual(["N3", "N2"]); // orden desc por scheduled_for
    const failed = await call(listNotifications, "/api/v1/notifications", { token: a.token, query: { status: "failed" } });
    expect(failed.json.data).toHaveLength(1);
    expect(failed.json.data[0].lastError).toContain("CHANNEL_NOT_CONFIGURED");
    const unread = await call(listNotifications, "/api/v1/notifications", { cookie: a.cookie, query: { unread: "true" } });
    expect(unread.json.pagination.total).toBe(4);
    const read = await call(listNotifications, "/api/v1/notifications", { token: a.token, query: { unread: "false" } });
    expect(read.json.data.map((n: any) => n.title)).toEqual(["N2"]);
    const email = await call(listNotifications, "/api/v1/notifications", { token: a.token, query: { channel: "email" } });
    expect(email.json.data.map((n: any) => n.title)).toEqual(["N5"]);
    const bad = await call(listNotifications, "/api/v1/notifications", { token: a.token, query: { status: "nope" } });
    expect(bad.status).toBe(400);
  });

  it("meta.unreadCount cuenta solo las no leídas del canal internal, sin importar filtros ni paginación, y por usuario", async () => {
    const a = await createTestActor();
    const b = await createTestActor({ email: "otro@test.local" });
    await seed(a.user.id); // internas enviadas sin leer: solo N1 (N2 leída, N3 failed, N4 pending, N5 es email)
    await seed(b.user.id);
    await db.update(notifications).set({ readAt: NOW }).where(eq(notifications.userId, b.user.id));
    const count = async (query: Record<string, string | number> = {}, who = a) =>
      (await call(listNotifications, "/api/v1/notifications", { token: who.token, query })).json.meta.unreadCount;
    expect(await count()).toBe(1);
    expect(await count({ unread: "true", channel: "internal", pageSize: 1 })).toBe(1);
    expect(await count({ channel: "email" })).toBe(1); // el filtro de la lista no altera el contador
    expect(await count({ page: 3, pageSize: 2 })).toBe(1);
    expect(await count({}, b)).toBe(0);
    const [n] = await db.select().from(notifications).where(and(eq(notifications.userId, a.user.id), eq(notifications.title, "N1")));
    await call(patchNotification, "/x", { method: "PATCH", token: a.token, params: { id: n!.id }, body: {} });
    expect(await count()).toBe(0);
    // una interna pendiente (disparo futuro, aún no enviada) no cuenta como no leída
    await db.insert(notifications).values({
      userId: a.user.id, channel: "internal", targetType: "event", targetId: crypto.randomUUID(), occurrenceKey: "future-pending",
      scheduledFor: new Date(NOW.getTime() + 3600_000), status: "pending", title: "Futura", body: "x",
    });
    expect(await count()).toBe(0);
  });

  it("PATCH marca leída / no leída", async () => {
    const a = await createTestActor();
    await seed(a.user.id);
    const [n] = await db.select().from(notifications).where(eq(notifications.title, "N1"));
    const r = await call(patchNotification, "/x", { method: "PATCH", token: a.token, params: { id: n!.id }, body: {} });
    expect(r.status).toBe(200);
    expect(r.json.data.readAt).toBeTruthy();
    const u = await call(patchNotification, "/x", { method: "PATCH", token: a.token, params: { id: n!.id }, body: { read: false } });
    expect(u.json.data.readAt).toBeNull();
    const bad = await call(patchNotification, "/x", { method: "PATCH", token: a.token, params: { id: "no-uuid" }, body: {} });
    expect(bad.status).toBe(400);
  });

  it("POST /test: internal crea fila enviada; telegram sin configuración → 422 CHANNEL_NOT_CONFIGURED", async () => {
    const a = await createTestActor();
    const okRes = await call(testNotification, "/api/v1/notifications/test", { token: a.token, body: { channel: "internal" } });
    expect(okRes.status).toBe(201);
    expect(okRes.json.data).toMatchObject({ delivered: true, notification: { status: "sent", channel: "internal" } });

    const prev = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      const r = await call(testNotification, "/api/v1/notifications/test", { token: a.token, body: { channel: "telegram" } });
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe("CHANNEL_NOT_CONFIGURED");
    } finally {
      if (prev) process.env.TELEGRAM_BOT_TOKEN = prev;
    }
    const rows = await db.select().from(notifications).where(and(eq(notifications.userId, a.user.id), eq(notifications.channel, "telegram")));
    expect(rows[0]).toMatchObject({ status: "failed" });
    expect(rows[0]!.lastError).toMatch(/^CHANNEL_NOT_CONFIGURED/);
    // las de prueba no las toca el barrido de obsolescencia
    await processReminders({ now: new Date(Date.now() + 1000) });
    expect((await db.select().from(notifications).where(eq(notifications.userId, a.user.id))).map((n) => n.status).sort()).toEqual(["failed", "sent"]);
  });
});

describe("applyDefaultReminders", () => {
  it("crea los recordatorios por defecto, es idempotente e ignora entradas inválidas", async () => {
    const { user } = await createTestUser();
    await db
      .update(userSettings)
      .set({
        defaultReminders: [
          { offsetMinutes: 15, channel: "internal" },
          { offsetMinutes: 60, channel: "email" },
          { offsetMinutes: 15, channel: "internal" }, // duplicado
          { offsetMinutes: -5, channel: "internal" }, // inválido
          { offsetMinutes: 5, channel: "sms" as any }, // inválido
        ],
      })
      .where(eq(userSettings.userId, user.id));
    const ev = await mkEvent(user.id, min(120));
    const created = await db.transaction((tx) => applyDefaultReminders(tx, user.id, { type: "event", id: ev.id }));
    expect(created.map((r) => [r.offsetMinutes, r.channel, r.targetType, r.eventId])).toEqual([
      [15, "internal", "event", ev.id],
      [60, "email", "event", ev.id],
    ]);
    const again = await db.transaction((tx) => applyDefaultReminders(tx, user.id, { type: "event", id: ev.id }));
    expect(again).toHaveLength(0);
    expect(await db.select().from(reminders)).toHaveLength(2);
  });

  it("participa de la transacción del llamador (rollback incluido) y sirve para tareas", async () => {
    const { user } = await createTestUser();
    await db.update(userSettings).set({ defaultReminders: [{ offsetMinutes: 30, channel: "internal" }] }).where(eq(userSettings.userId, user.id));
    const [t] = await db.insert(tasks).values({ userId: user.id, title: "t", dueAt: min(100) }).returning();
    await expect(
      db.transaction(async (tx) => {
        await applyDefaultReminders(tx, user.id, { type: "task", id: t!.id });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await db.select().from(reminders)).toHaveLength(0);
    const res = await applyDefaultReminders(db, user.id, { type: "task", id: t!.id });
    expect(res[0]).toMatchObject({ taskId: t!.id, targetType: "task", offsetMinutes: 30 });
  });

  it("sin defaults configurados no crea nada", async () => {
    const { user } = await createTestUser();
    const ev = await mkEvent(user.id, min(10));
    expect(await applyDefaultReminders(db, user.id, { type: "event", id: ev.id })).toEqual([]);
  });
});
