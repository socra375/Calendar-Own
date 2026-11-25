import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { revokeToken } from "@/server/auth/tokens";
import { call, createTestActor, resetDb } from "../helpers";
import { api, routes, sd } from "../helpers/api";

let a: Awaited<ReturnType<typeof createTestActor>>;
beforeEach(async () => {
  await resetDb();
  a = await createTestActor();
});

describe("autenticación en todos los endpoints", () => {
  const cases: [string, any, string, string, unknown?][] = [
    ["events", routes.eventsRoute.GET, "/events", "GET"],
    ["events POST", routes.eventsRoute.POST, "/events", "POST", { title: "x", startAt: sd("2030-01-01", "10:00") }],
    ["availability", routes.availability.GET, "/availability", "GET"],
    ["free-slots", routes.freeSlots.GET, "/availability/free-slots", "GET"],
    ["tasks", routes.tasksRoute.GET, "/tasks", "GET"],
    ["categories", routes.categoriesRoute.GET, "/categories", "GET"],
    ["tags", routes.tagsRoute.GET, "/tags", "GET"],
    ["special-dates", routes.sdRoute.GET, "/special-dates", "GET"],
    ["reminders", routes.remindersRoute.GET, "/reminders", "GET"],
    ["dashboard", routes.dashboardRoute.GET, "/dashboard", "GET"],
    ["agenda", routes.agendaRoute.GET, "/agenda", "GET"],
    ["search", routes.searchRoute.GET, "/search", "GET"],
    ["settings", routes.settingsRoute.GET, "/settings", "GET"],
    ["tokens", routes.tokensRoute.GET, "/tokens", "GET"],
    ["audit-logs", routes.auditRoute.GET, "/audit-logs", "GET"],
  ];
  it.each(cases)("%s: 401 sin credenciales", async (_n, h, path, method, body) => {
    const r = await call(h, `/api/v1${path}`, { method, body });
    expect(r.status).toBe(401);
    expect(r.json).toMatchObject({ success: false, data: null, error: { code: "UNAUTHORIZED" } });
  });

  it("token revocado -> 401 en la API de dominio; token rotado/revocado vía API", async () => {
    const e = api({ token: a.token });
    expect((await e.listEvents()).status).toBe(200);
    await revokeToken(a.user.id, a.tokenId);
    expect((await e.listEvents()).status).toBe(401);
  });

  it("cookie sin Origin válido en mutaciones -> 403 (CSRF)", async () => {
    const r = await call(routes.eventsRoute.POST, "/api/v1/events", { cookie: a.cookie, origin: "https://evil.example", body: { title: "x", startAt: sd("2030-01-01", "10:00") } });
    expect(r.status).toBe(403);
    expect((await call(routes.eventsRoute.GET, "/api/v1/events", { cookie: a.cookie, origin: "https://evil.example" })).status).toBe(200); // GET no exige Origin
  });
});

describe("aislamiento por usuario", () => {
  it("un usuario nunca ve ni modifica recursos de otro (404) en todos los recursos", async () => {
    const b = await createTestActor({ email: "b@test.local" });
    const A = api({ token: a.token });
    const B = api({ token: b.token });
    const ev = (await A.createEvent({ title: "Privado", startAt: sd("2030-03-04", "09:00"), tags: ["secreto"] })).json.data;
    const task = (await A.createTask({ title: "T privada" })).json.data;
    const cat = (await A.createCategory({ name: "Mía" })).json.data;
    const sdate = (await A.createSd({ title: "Cumple", date: "1990-01-01" })).json.data;
    const rem = (await A.createReminder({ targetType: "event", targetId: ev.id, offsetMinutes: 5 })).json.data;
    const tag = (await A.listTags()).json.data[0];

    expect((await B.getEvent(ev.id)).status).toBe(404);
    expect((await B.patchEvent(ev.id, { title: "hack" })).status).toBe(404);
    expect((await B.deleteEvent(ev.id)).status).toBe(404);
    expect((await B.duplicateEvent(ev.id)).status).toBe(404);
    expect((await B.getTask(task.id)).status).toBe(404);
    expect((await B.patchTask(task.id, { title: "x" })).status).toBe(404);
    expect((await B.deleteTask(task.id)).status).toBe(404);
    expect((await B.getCategory(cat.id)).status).toBe(404);
    expect((await B.patchCategory(cat.id, { name: "x" })).status).toBe(404);
    expect((await B.getSd(sdate.id)).status).toBe(404);
    expect((await B.deleteSd(sdate.id)).status).toBe(404);
    expect((await B.patchReminder(rem.id, { isActive: false })).status).toBe(404);
    expect((await B.deleteReminder(rem.id)).status).toBe(404);
    expect((await B.patchTag(tag.id, { name: "x" })).status).toBe(404);
    expect((await B.deleteTag(tag.id)).status).toBe(404);
    expect((await B.createTask({ title: "x", categoryId: cat.id })).status).toBe(400);
    expect((await B.createEvent({ title: "x", startAt: sd("2030-03-04", "09:00"), categoryId: cat.id })).status).toBe(400);

    for (const r of [
      await B.listEvents(), await B.listTasks(), await B.listCategories(), await B.listSd(), await B.listReminders(), await B.listTags(),
      await B.listEvents({ from: "2030-03-01", to: "2030-03-31" }),
    ]) expect(r.json.data).toEqual([]);
    expect((await B.search({ q: "Privado" })).json.data.totals).toEqual({ events: 0, tasks: 0, specialDates: 0 });
    expect((await B.availability({ from: "2030-03-04", to: "2030-03-05" })).json.data.busy).toEqual([]);
    expect((await B.auditLogs()).json.data).toEqual([]);
    // B no genera conflictos con eventos de A
    const bEv = await B.createEvent({ title: "Mío", startAt: sd("2030-03-04", "09:00"), isBlocking: true });
    expect(bEv.json.meta.conflicts).toEqual([]);
    // y A sigue intacto
    expect((await A.getEvent(ev.id)).json.data.title).toBe("Privado");
  });
});

describe("tokens (solo sesión)", () => {
  it("un token Eddie NO puede gestionar tokens; la sesión sí (crear, listar, rotar, revocar)", async () => {
    const eddie = api({ token: a.token });
    const owner = api({ cookie: a.cookie });
    expect((await eddie.listTokens()).status).toBe(401);
    expect((await eddie.createToken({ name: "x" })).status).toBe(401);
    expect((await eddie.rotateToken(a.tokenId)).status).toBe(401);
    expect((await eddie.revokeToken(a.tokenId)).status).toBe(401);

    const c = await owner.createToken({ name: "Eddie prod", scopes: ["*"] });
    expect(c.status).toBe(201);
    expect(c.json.data.token).toMatch(/^pc_[\w-]{43}$/);
    expect(c.json.data.record).toMatchObject({ name: "Eddie prod", tokenPrefix: c.json.data.token.slice(0, 12), revokedAt: null });
    // el token funciona
    expect((await api({ token: c.json.data.token }).listEvents()).status).toBe(200);
    // el listado nunca devuelve el token ni el hash
    const l = await owner.listTokens();
    expect(JSON.stringify(l.json)).not.toContain(c.json.data.token);
    expect(JSON.stringify(l.json)).not.toMatch(/tokenHash|token_hash/);
    // rotar
    const rot = await owner.rotateToken(c.json.data.record.id);
    expect(rot.status).toBe(201);
    expect(rot.json.data.token).not.toBe(c.json.data.token);
    expect((await api({ token: c.json.data.token }).listEvents()).status).toBe(401);
    expect((await api({ token: rot.json.data.token }).listEvents()).status).toBe(200);
    expect((await owner.rotateToken(c.json.data.record.id)).status).toBe(404); // ya revocado
    // revocar
    expect((await owner.revokeToken(rot.json.data.record.id)).status).toBe(200);
    expect((await api({ token: rot.json.data.token }).listEvents()).status).toBe(401);
    expect((await owner.createToken({ name: "" })).status).toBe(400);
    // ajeno
    const b = await createTestActor({ email: "b@test.local" });
    expect((await api({ cookie: b.cookie }).revokeToken(a.tokenId)).status).toBe(404);
  });
});

describe("audit log", () => {
  it("registra actor user vs eddie, filtros y NUNCA tokens/contraseñas", async () => {
    const owner = api({ cookie: a.cookie });
    const eddie = api({ token: a.token });
    const created = await owner.createToken({ name: "secreto-test" });
    await owner.rotateToken(created.json.data.record.id);
    await owner.patchSettings({ telegramChatId: "12345" });
    await eddie.createEvent({ title: "Por Eddie", startAt: sd("2030-03-04", "09:00") });
    await eddie.createTask({ title: "Task Eddie" });

    const all = (await owner.auditLogs({ pageSize: 100 })).json;
    expect(all.pagination.total).toBeGreaterThanOrEqual(5);
    const dump = JSON.stringify(all.data);
    expect(dump).not.toContain(created.json.data.token);
    expect(dump).not.toMatch(/pc_[\w-]{43}/);
    expect(dump).not.toMatch(/passwordHash|password_hash|\$argon2/);
    // incluso directamente en la tabla
    const raw = JSON.stringify(await db.select().from(auditLogs));
    expect(raw).not.toContain(created.json.data.token);

    const eddieLogs = (await owner.auditLogs({ actorType: "eddie" })).json.data;
    expect(eddieLogs.map((l: any) => l.action).sort()).toEqual(["event.create", "task.create"]);
    expect(eddieLogs[0].apiTokenId).toBe(a.tokenId);
    const userLogs = (await owner.auditLogs({ actorType: "user", pageSize: 100 })).json.data;
    expect(userLogs.every((l: any) => l.actorType === "user")).toBe(true);
    expect((await owner.auditLogs({ action: "token.*" })).json.data.map((l: any) => l.action).sort()).toEqual(["token.create", "token.rotate"]);
    expect((await owner.auditLogs({ resourceType: "task" })).json.data).toHaveLength(1);
    expect((await owner.auditLogs({ q: "Por Eddie" })).json.data).toHaveLength(1);
    expect((await owner.auditLogs({ from: "2020-01-01", to: "2020-01-02" })).json.data).toHaveLength(0);
    expect((await owner.auditLogs({ actorType: "robot" })).status).toBe(400);
    expect((await owner.auditLogs({ pageSize: 500 })).status).toBe(400);
  });
});
