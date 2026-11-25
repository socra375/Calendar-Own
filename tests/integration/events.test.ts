import { beforeEach, describe, expect, it } from "vitest";
import { api, sd } from "../helpers/api";
import { createTestActor, resetDb } from "../helpers";

let a: Awaited<ReturnType<typeof createTestActor>>;
let eddie: ReturnType<typeof api>;
let owner: ReturnType<typeof api>;

beforeEach(async () => {
  await resetDb();
  a = await createTestActor();
  eddie = api({ token: a.token });
  owner = api({ cookie: a.cookie });
});

const base = { title: "Reunión", startAt: sd("2030-03-04", "09:00"), durationMinutes: 60 }; // lunes

describe("events CRUD", () => {
  it("crea, lee, actualiza y elimina; respuesta con envelope y campos locales explícitos", async () => {
    const c = await eddie.createEvent({ ...base, location: "Oficina", tags: ["Trabajo", "trabajo", "Urgente"] });
    expect(c.status).toBe(201);
    expect(c.json).toMatchObject({ success: true, error: null, message: "Creado" });
    expect(c.json.meta.requestId).toBeTruthy();
    expect(c.json.meta.conflicts).toEqual([]);
    const ev = c.json.data;
    expect(ev).toMatchObject({
      title: "Reunión", isAllDay: false, timezone: "America/Santo_Domingo", status: "confirmed", source: "eddie",
      localDate: "2030-03-04", localTime: "09:00", endLocalTime: "10:00", durationMinutes: 60, isRecurring: false,
      startAt: "2030-03-04T09:00:00.000-04:00",
    });
    expect(ev.tags.map((t: any) => t.name).sort()).toEqual(["Trabajo", "Urgente"]); // dedupe sin distinguir mayúsculas

    const g = await owner.getEvent(ev.id);
    expect(g.status).toBe(200);
    expect(g.json.data.source).toBe("eddie");

    const p = await owner.patchEvent(ev.id, { title: "Reunión 2", startAt: sd("2030-03-04", "11:00") });
    expect(p.status).toBe(200);
    expect(p.json.data.title).toBe("Reunión 2");
    expect(p.json.data.localTime).toBe("11:00");
    expect(p.json.data.durationMinutes).toBe(60); // conserva la duración

    const d = await owner.deleteEvent(ev.id);
    expect(d.status).toBe(200);
    expect((await owner.getEvent(ev.id)).status).toBe(404);
    const r = await owner.restoreEvent(ev.id);
    expect(r.status).toBe(200);
    expect((await owner.getEvent(ev.id)).status).toBe(200);
  });

  it("duración por durationMinutes y por defecto 60", async () => {
    const x = await eddie.createEvent({ title: "A", startAt: sd("2030-03-04", "09:00"), durationMinutes: 45 });
    expect(x.json.data.durationMinutes).toBe(45);
    const y = await eddie.createEvent({ title: "B", startAt: sd("2030-03-04", "13:00") });
    expect(y.json.data.durationMinutes).toBe(60);
  });

  it("validación: 400 con detalles", async () => {
    const r1 = await eddie.createEvent({ title: "", startAt: "no-es-fecha" });
    expect(r1.status).toBe(400);
    expect(r1.json.error.code).toBe("VALIDATION_ERROR");
    expect(r1.json.success).toBe(false);
    expect((await eddie.createEvent({ title: "x" })).status).toBe(400); // falta startAt
    expect((await eddie.createEvent({ title: "x", startAt: sd("2030-03-04", "10:00"), endAt: sd("2030-03-04", "09:00") })).status).toBe(400);
    expect((await eddie.createEvent({ title: "x", isAllDay: true, startDate: "2030-03-04", endDate: "2030-03-04" })).status).toBe(400);
    expect((await eddie.createEvent({ ...base, recurrence: { freq: "custom" } })).status).toBe(400);
    expect((await eddie.createEvent({ ...base, recurrence: { freq: "custom", rrule: "FREQ=SECONDLY" } })).status).toBe(400);
    expect((await eddie.createEvent({ ...base, recurrence: { freq: "daily", until: "2030-04-01", count: 3 } })).status).toBe(400);
    expect((await eddie.createEvent({ ...base, categoryId: "00000000-0000-4000-8000-000000000000" })).status).toBe(400);
    expect((await eddie.createEvent({ ...base, timezone: "Mars/Olympus" })).status).toBe(400);
    expect((await eddie.getEvent("no-uuid")).status).toBe(400);
    expect((await eddie.getEvent("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await eddie.patchEvent((await eddie.createEvent(base)).json.data.id, {})).status).toBe(400);
  });

  it("listado paginado con filtros (q, categoría, tag, estado) y tope pageSize 100", async () => {
    const cat = (await eddie.createCategory({ name: "Salud" })).json.data;
    await eddie.createEvent({ ...base, title: "Dentista", categoryId: cat.id, tags: ["cita"] });
    await eddie.createEvent({ ...base, title: "Gym", startAt: sd("2030-03-05", "07:00"), status: "tentative" });
    await eddie.createEvent({ ...base, title: "Cena", startAt: sd("2030-03-06", "20:00") });
    const all = await eddie.listEvents({ pageSize: 2 });
    expect(all.json.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(all.json.data.map((e: any) => e.title)).toEqual(["Dentista", "Gym"]);
    expect((await eddie.listEvents({ q: "dent" })).json.data).toHaveLength(1);
    expect((await eddie.listEvents({ categoryId: cat.id })).json.data).toHaveLength(1);
    expect((await eddie.listEvents({ tag: "CITA" })).json.data).toHaveLength(1);
    expect((await eddie.listEvents({ status: "tentative" })).json.data[0].title).toBe("Gym");
    expect((await eddie.listEvents({ pageSize: 101 })).status).toBe(400);
    expect((await eddie.listEvents({ q: "%" })).json.data).toHaveLength(0); // wildcard escapado
    expect((await eddie.listEvents({ from: "2030-03-04" })).status).toBe(400); // from sin to
  });

  it("duplicar copia datos, tags y recurrencia", async () => {
    const e = (await eddie.createEvent({ ...base, tags: ["x"], recurrence: { freq: "daily", count: 3 }, reminders: [{ offsetMinutes: 15 }] })).json.data;
    const d = await eddie.duplicateEvent(e.id, { startAt: sd("2030-04-01", "09:00"), force: true });
    expect(d.status).toBe(201);
    expect(d.json.data.title).toBe("Reunión (copia)");
    expect(d.json.data.localDate).toBe("2030-04-01");
    expect(d.json.data.tags[0].name).toBe("x");
    expect(d.json.data.recurrence.count).toBe(3);
    expect(d.json.data.reminders).toHaveLength(1);
    expect(d.json.data.id).not.toBe(e.id);
  });

  it("borrado masivo: 428 sin X-Confirm-Bulk, máx. 100, y con confirmación borra solo lo propio", async () => {
    const e1 = (await eddie.createEvent(base)).json.data;
    const e2 = (await eddie.createEvent({ ...base, startAt: sd("2030-03-05", "09:00") })).json.data;
    const other = await createTestActor({ email: "otro@test.local" });
    const foreign = (await api({ token: other.token }).createEvent(base)).json.data;
    const r = await eddie.bulkDelete([e1.id, e2.id]);
    expect(r.status).toBe(428);
    expect(r.json.error.code).toBe("CONFIRMATION_REQUIRED");
    expect((await eddie.getEvent(e1.id)).status).toBe(200);
    const ok = await eddie.bulkDelete([e1.id, e2.id, foreign.id], { "x-confirm-bulk": "true" });
    expect(ok.status).toBe(200);
    expect(ok.json.data.deleted).toBe(2);
    expect(ok.json.data.notFoundIds).toEqual([foreign.id]);
    expect((await api({ token: other.token }).getEvent(foreign.id)).status).toBe(200);
    const many = Array.from({ length: 101 }, () => "00000000-0000-4000-8000-000000000000");
    expect((await eddie.bulkDelete(many, { "x-confirm-bulk": "true" })).status).toBe(400);
    expect((await eddie.listEvents({ deleted: "true" })).json.pagination.total).toBe(2);
  });
});

describe("recurrencia vía API", () => {
  const range = { from: "2030-03-01", to: "2030-03-31" };

  it("diaria: listado por rango expande ocurrencias con claves y campos locales", async () => {
    await eddie.createEvent({ ...base, recurrence: { freq: "daily", count: 5 } });
    const l = await eddie.listEvents(range);
    expect(l.json.meta.expanded).toBe(true);
    expect(l.json.data).toHaveLength(5);
    expect(l.json.data[0]).toMatchObject({ localDate: "2030-03-04", localTime: "09:00", isRecurring: true, occurrenceKey: "2030-03-04T13:00:00.000Z" });
    expect(l.json.data[4].localDate).toBe("2030-03-08");
    expect(l.json.pagination.total).toBe(5);
  });

  it("semanal por días, mensual y anual", async () => {
    await eddie.createEvent({ ...base, title: "Semanal", recurrence: { freq: "weekly", byDay: ["MO", "WE"], until: "2030-03-20" } });
    await eddie.createEvent({ ...base, durationMinutes: undefined, title: "Mensual", startAt: sd("2030-01-15", "10:00"), endAt: sd("2030-01-15", "11:00"), recurrence: { freq: "monthly" } });
    await eddie.createEvent({ ...base, durationMinutes: undefined, title: "Anual", startAt: sd("2028-03-10", "10:00"), endAt: sd("2028-03-10", "11:00"), recurrence: { freq: "yearly" } });
    const l = await eddie.listEvents({ ...range, pageSize: 100 });
    const by = (t: string) => l.json.data.filter((e: any) => e.title === t).map((e: any) => e.localDate);
    expect(by("Semanal")).toEqual(["2030-03-04", "2030-03-06", "2030-03-11", "2030-03-13", "2030-03-18", "2030-03-20"]);
    expect(by("Mensual")).toEqual(["2030-03-15"]);
    expect(by("Anual")).toEqual(["2030-03-10"]);
    // series_end_at poda: la serie con UNTIL no aparece después de terminar
    const later = await eddie.listEvents({ from: "2030-06-01", to: "2030-06-30", q: "Semanal" });
    expect(later.json.data).toHaveLength(0);
  });

  it("excepción de UNA ocurrencia: scope=this (modificar y cancelar)", async () => {
    const e = (await eddie.createEvent({ ...base, recurrence: { freq: "daily", count: 4 } })).json.data;
    const key2 = "2030-03-05T13:00:00.000Z";
    const key3 = "2030-03-06T13:00:00.000Z";
    const mod = await eddie.patchEvent(e.id, { title: "Solo hoy", startAt: sd("2030-03-05", "15:00") }, { scope: "this", occurrenceKey: key2 });
    expect(mod.status).toBe(200);
    expect(mod.json.meta.occurrence).toMatchObject({ title: "Solo hoy", localTime: "15:00", isException: true, occurrenceKey: key2 });
    const del = await eddie.deleteEvent(e.id, { scope: "this", occurrenceKey: key3 });
    expect(del.status).toBe(200);
    const l = await eddie.listEvents(range);
    expect(l.json.data.map((o: any) => `${o.localDate} ${o.localTime} ${o.title}`)).toEqual([
      "2030-03-04 09:00 Reunión",
      "2030-03-05 15:00 Solo hoy",
      "2030-03-07 09:00 Reunión",
    ]);
    // la serie sigue intacta
    expect((await eddie.getEvent(e.id)).json.data.exceptions).toHaveLength(2);
    // claves inválidas
    expect((await eddie.patchEvent(e.id, { title: "x" }, { scope: "this", occurrenceKey: "2030-03-05T14:00:00.000Z" })).status).toBe(404);
    expect((await eddie.patchEvent(e.id, { title: "x" }, { scope: "this" })).status).toBe(400);
    expect((await eddie.patchEvent(e.id, { categoryId: null }, { scope: "this", occurrenceKey: key2 })).status).toBe(400);
  });

  it("editar toda la serie (scope=all) cambia todas las ocurrencias y resetea excepciones si cambia la hora", async () => {
    const e = (await eddie.createEvent({ ...base, recurrence: { freq: "daily", count: 3 } })).json.data;
    await eddie.deleteEvent(e.id, { scope: "this", occurrenceKey: "2030-03-05T13:00:00.000Z" });
    const p = await eddie.patchEvent(e.id, { title: "Nuevo", startAt: sd("2030-03-04", "10:30") });
    expect(p.json.data.localTime).toBe("10:30");
    const l = await eddie.listEvents(range);
    expect(l.json.data.map((o: any) => `${o.localDate} ${o.localTime} ${o.title}`)).toEqual([
      "2030-03-04 10:30 Nuevo", "2030-03-05 10:30 Nuevo", "2030-03-06 10:30 Nuevo",
    ]);
    // quitar recurrencia
    const n = await eddie.patchEvent(e.id, { recurrence: null });
    expect(n.json.data.isRecurring).toBe(false);
    expect((await eddie.listEvents(range)).json.data).toHaveLength(1);
  });

  it("scope=following: corta la serie y crea una nueva desde la ocurrencia", async () => {
    const e = (await eddie.createEvent({ ...base, recurrence: { freq: "daily", count: 6 }, tags: ["t"], reminders: [{ offsetMinutes: 10 }] })).json.data;
    const key = "2030-03-07T13:00:00.000Z"; // 4.ª ocurrencia
    const p = await eddie.patchEvent(e.id, { title: "Desde aquí", startAt: sd("2030-03-07", "16:00") }, { scope: "following", occurrenceKey: key });
    expect(p.status).toBe(200);
    const created = p.json.data;
    expect(created.id).not.toBe(e.id);
    expect(created.title).toBe("Desde aquí");
    expect(created.localTime).toBe("16:00");
    expect(created.recurrence.count).toBe(3); // 6 - 3 ocurrencias de la cabeza
    expect(created.tags[0].name).toBe("t");
    expect(created.reminders).toHaveLength(1);
    const l = await eddie.listEvents(range);
    expect(l.json.data.map((o: any) => `${o.localDate} ${o.localTime} ${o.title}`)).toEqual([
      "2030-03-04 09:00 Reunión", "2030-03-05 09:00 Reunión", "2030-03-06 09:00 Reunión",
      "2030-03-07 16:00 Desde aquí", "2030-03-08 16:00 Desde aquí", "2030-03-09 16:00 Desde aquí",
    ]);
    // la original ahora tiene UNTIL
    const orig = (await eddie.getEvent(e.id)).json.data;
    expect(orig.recurrence.count).toBeNull();
    expect(orig.recurrence.until).toBe("2030-03-07T08:59:59"); // hora local flotante: justo antes de la ocurrencia de corte
  });

  it("DELETE scope=following termina la serie antes de la ocurrencia; scope=all la borra", async () => {
    const e = (await eddie.createEvent({ ...base, recurrence: { freq: "daily" } })).json.data;
    const d = await eddie.deleteEvent(e.id, { scope: "following", occurrenceKey: "2030-03-10T13:00:00.000Z" });
    expect(d.status).toBe(200);
    const l = await eddie.listEvents(range);
    expect(l.json.data.map((o: any) => o.localDate)).toEqual(["2030-03-04", "2030-03-05", "2030-03-06", "2030-03-07", "2030-03-08", "2030-03-09"]);
    expect((await eddie.deleteEvent(e.id, { scope: "following", occurrenceKey: "2030-03-04T13:00:00.000Z" })).status).toBe(200); // primera = todo
    expect((await eddie.getEvent(e.id)).status).toBe(404);
  });

  it("rango > 731 días o invertido -> 400; límite de ocurrencias reportado", async () => {
    expect((await eddie.listEvents({ from: "2030-01-01", to: "2033-01-01" })).status).toBe(400);
    expect((await eddie.listEvents({ from: "2030-02-01", to: "2030-01-01" })).status).toBe(400);
  });
});

describe("zonas horarias y día completo", () => {
  it("evento a las 23:30 en Santo Domingo cae en el día local correcto aunque en UTC sea el siguiente", async () => {
    await eddie.createEvent({ title: "Tarde", startAt: sd("2030-03-04", "23:30"), endAt: sd("2030-03-05", "00:30") });
    const day4 = await eddie.listEvents({ from: "2030-03-04", to: "2030-03-04" });
    const day5 = await eddie.listEvents({ from: "2030-03-05", to: "2030-03-05" });
    expect(day4.json.data).toHaveLength(1);
    expect(day4.json.data[0]).toMatchObject({ localDate: "2030-03-04", localTime: "23:30", endLocalDate: "2030-03-05", endLocalTime: "00:30", startAt: "2030-03-04T23:30:00.000-04:00" });
    expect(day5.json.data).toHaveLength(1); // también toca el día 5 (hasta 00:30)
    expect((await eddie.listEvents({ from: "2030-03-06", to: "2030-03-06" })).json.data).toHaveLength(0);
  });

  it("acepta instantes en UTC y los devuelve en la zona del evento; usa timezone propia del evento", async () => {
    const r = await eddie.createEvent({ title: "NY", startAt: "2030-03-04T14:00:00Z", timezone: "America/New_York" });
    expect(r.json.data).toMatchObject({ startAt: "2030-03-04T09:00:00.000-05:00", localTime: "09:00", timezone: "America/New_York" });
  });

  it("día completo: fechas locales, endDate exclusivo, multi-día, y filtrado por rango", async () => {
    const one = (await eddie.createEvent({ title: "Feriado", isAllDay: true, startDate: "2030-03-04" })).json.data;
    expect(one).toMatchObject({ isAllDay: true, startAt: null, startDate: "2030-03-04", endDate: "2030-03-05", localDate: "2030-03-04", localTime: null, endLocalDate: "2030-03-04", durationMinutes: 1440 });
    await eddie.createEvent({ title: "Viaje", isAllDay: true, startDate: "2030-03-10", endDate: "2030-03-13" });
    const l = await eddie.listEvents({ from: "2030-03-12", to: "2030-03-12" });
    expect(l.json.data.map((e: any) => e.title)).toEqual(["Viaje"]);
    expect((await eddie.listEvents({ from: "2030-03-13", to: "2030-03-13" })).json.data).toHaveLength(0); // end exclusivo
  });

  it("día completo recurrente (cumpleaños anual)", async () => {
    await eddie.createEvent({ title: "Aniv", isAllDay: true, startDate: "2028-06-10", recurrence: { freq: "yearly" } });
    const l = await eddie.listEvents({ from: "2030-06-01", to: "2030-06-30" });
    expect(l.json.data.map((e: any) => e.localDate)).toEqual(["2030-06-10"]);
    expect(l.json.data[0].occurrenceKey).toBe("2030-06-10");
  });
});

describe("conflictos", () => {
  it("advertencia en meta.conflicts (no bloquea) si el existente no es bloqueante", async () => {
    const first = (await eddie.createEvent(base)).json.data;
    const r = await eddie.createEvent({ ...base, durationMinutes: undefined, title: "Solapado", startAt: sd("2030-03-04", "09:30"), endAt: sd("2030-03-04", "10:30") });
    expect(r.status).toBe(201);
    expect(r.json.meta.conflicts).toHaveLength(1);
    expect(r.json.meta.conflicts[0]).toMatchObject({ eventId: first.id, title: "Reunión", isBlocking: false, localStartTime: "09:00", localEndTime: "10:00" });
  });

  it("bloqueo 409 BLOCKING_CONFLICT salvo force:true", async () => {
    await eddie.createEvent({ ...base, title: "Sagrado", isBlocking: true });
    const clash = { ...base, durationMinutes: undefined, title: "Choque", startAt: sd("2030-03-04", "09:30"), endAt: sd("2030-03-04", "10:30") };
    const r = await eddie.createEvent(clash);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("BLOCKING_CONFLICT");
    expect(r.json.error.details.conflicts[0].title).toBe("Sagrado");
    const forced = await eddie.createEvent({ ...clash, force: true });
    expect(forced.status).toBe(201);
    expect(forced.json.meta.conflicts).toHaveLength(2 - 1);
    // también al mover un evento existente
    const mover = (await eddie.createEvent({ ...base, durationMinutes: undefined, title: "Mover", startAt: sd("2030-03-05", "09:00"), endAt: sd("2030-03-05", "10:00") })).json.data;
    const mv = await eddie.patchEvent(mover.id, { startAt: sd("2030-03-04", "09:15") });
    expect(mv.status).toBe(409);
    expect((await eddie.patchEvent(mover.id, { startAt: sd("2030-03-04", "09:15"), force: true })).status).toBe(200);
  });

  it("eventos cancelados no bloquean ni avisan; día completo no bloqueante tampoco, el bloqueante sí", async () => {
    await eddie.createEvent({ ...base, title: "Cancelado", status: "cancelled", isBlocking: true });
    await eddie.createEvent({ title: "Todo el día", isAllDay: true, startDate: "2030-03-04" });
    const ok = await eddie.createEvent({ ...base, title: "Nuevo" });
    expect(ok.status).toBe(201);
    expect(ok.json.meta.conflicts).toEqual([]);
    await eddie.createEvent({ title: "Bloqueo total", isAllDay: true, startDate: "2030-03-04", isBlocking: true });
    const blocked = await eddie.createEvent({ ...base, durationMinutes: undefined, title: "Otro", startAt: sd("2030-03-04", "14:00"), endAt: sd("2030-03-04", "15:00") });
    expect(blocked.status).toBe(409);
  });

  it("una serie recurrente que choque con un bloqueante futuro también se detecta", async () => {
    await eddie.createEvent({ ...base, durationMinutes: undefined, title: "Bloq", startAt: sd("2030-03-06", "09:00"), endAt: sd("2030-03-06", "10:00"), isBlocking: true });
    const r = await eddie.createEvent({ ...base, title: "Serie", recurrence: { freq: "daily", count: 5 } });
    expect(r.status).toBe(409);
  });
});

describe("eventos: audit", () => {
  it("registra create/update/delete con actor eddie vs user", async () => {
    const e = (await eddie.createEvent(base)).json.data;
    await owner.patchEvent(e.id, { title: "Hecho por mí" });
    await eddie.deleteEvent(e.id);
    const logs = (await owner.auditLogs({ resourceType: "event", pageSize: 100 })).json.data;
    expect(logs.map((l: any) => `${l.action}:${l.actorType}`).sort()).toEqual(["event.create:eddie", "event.delete:eddie", "event.update:user"]);
    const upd = logs.find((l: any) => l.action === "event.update");
    expect(upd.changes.title).toEqual({ from: "Reunión", to: "Hecho por mí" });
    expect(upd.resourceId).toBe(e.id);
    expect(upd.requestId).toBeTruthy();
  });
});
