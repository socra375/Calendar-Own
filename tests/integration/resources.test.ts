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

describe("categories", () => {
  it("CRUD, nombre único (409), soft delete y restore", async () => {
    const c = await eddie.createCategory({ name: "Trabajo", color: "#ff0000" });
    expect(c.status).toBe(201);
    expect(c.json.data).toMatchObject({ name: "Trabajo", color: "#ff0000", isActive: true });
    expect((await eddie.createCategory({ name: "trabajo" })).status).toBe(409);
    expect((await eddie.createCategory({ name: "X", color: "rojo" })).status).toBe(400);
    const p = await eddie.patchCategory(c.json.data.id, { name: "Oficina", isActive: false });
    expect(p.json.data).toMatchObject({ name: "Oficina", isActive: false });
    expect((await eddie.listCategories({ active: "false" })).json.data).toHaveLength(1);
    expect((await eddie.deleteCategory(c.json.data.id)).status).toBe(200);
    expect((await eddie.getCategory(c.json.data.id)).status).toBe(404);
    expect((await eddie.listCategories()).json.data).toHaveLength(0);
    expect((await eddie.listCategories({ deleted: "true" })).json.data).toHaveLength(1);
    // nombre reutilizable mientras está borrada; restaurar entonces choca
    await eddie.createCategory({ name: "Oficina" });
    expect((await eddie.restoreCategory(c.json.data.id)).status).toBe(409);
  });
  it("restore de categoría borrada", async () => {
    const c = (await eddie.createCategory({ name: "Casa" })).json.data;
    await eddie.deleteCategory(c.id);
    const r = await eddie.restoreCategory(c.id);
    expect(r.status).toBe(200);
    expect(r.json.data.deletedAt).toBeNull();
  });
});

describe("tags", () => {
  it("CRUD, único sin distinguir mayúsculas y conteo de uso", async () => {
    const t = (await eddie.createTag({ name: "Urgente", color: "#ff0000" })).json.data;
    expect((await eddie.createTag({ name: "urgente" })).status).toBe(409);
    await eddie.createEvent({ title: "e", startAt: sd("2030-03-04", "09:00"), tags: ["urgente"] });
    await eddie.createTask({ title: "t", tags: ["URGENTE"] });
    const l = await eddie.listTags();
    expect(l.json.data[0]).toMatchObject({ name: "Urgente", usage: { events: 1, tasks: 1 } });
    expect((await eddie.patchTag(t.id, { name: "Crítico" })).json.data.name).toBe("Crítico");
    expect((await eddie.deleteTag(t.id)).status).toBe(200);
    expect((await eddie.listTags()).json.data).toHaveLength(0);
    expect((await eddie.deleteTag(t.id)).status).toBe(404);
  });
});

describe("tasks", () => {
  it("CRUD con completed_at automático, relación con evento, filtros y orden", async () => {
    const ev = (await eddie.createEvent({ title: "Reunión", startAt: sd("2030-03-04", "09:00") })).json.data;
    const cat = (await eddie.createCategory({ name: "Pro" })).json.data;
    const t = await eddie.createTask({ title: "Preparar slides", dueAt: sd("2030-03-03", "18:00"), priority: "high", eventId: ev.id, categoryId: cat.id, tags: ["slides"] });
    expect(t.status).toBe(201);
    expect(t.json.data).toMatchObject({ status: "pending", priority: "high", completedAt: null, event: { id: ev.id, title: "Reunión" }, category: { name: "Pro" }, dueLocalDate: "2030-03-03", dueLocalTime: "18:00", isOverdue: false });
    const id = t.json.data.id;
    const done = await eddie.patchTask(id, { status: "completed" });
    expect(done.json.data.completedAt).toMatch(/-04:00$/);
    const again = await eddie.patchTask(id, { title: "Slides" });
    expect(again.json.data.completedAt).toBe(done.json.data.completedAt); // no se reescribe
    const reopened = await eddie.patchTask(id, { status: "in_progress" });
    expect(reopened.json.data.completedAt).toBeNull();
    expect((await eddie.createTask({ title: "x", status: "completed" })).json.data.completedAt).not.toBeNull();

    await eddie.createTask({ title: "Vencida", dueAt: "2020-01-01T10:00:00Z", priority: "urgent" });
    await eddie.createTask({ title: "Sin fecha", priority: "low" });
    const overdue = await eddie.listTasks({ overdue: "true" });
    expect(overdue.json.data.map((x: any) => x.title)).toEqual(["Vencida"]);
    expect(overdue.json.data[0].isOverdue).toBe(true);
    expect((await eddie.listTasks({ status: "pending,in_progress" })).json.data.length).toBe(3);
    expect((await eddie.listTasks({ priority: "urgent" })).json.data).toHaveLength(1);
    expect((await eddie.listTasks({ eventId: ev.id })).json.data).toHaveLength(1);
    expect((await eddie.listTasks({ tag: "SLIDES" })).json.data).toHaveLength(1);
    expect((await eddie.listTasks({ q: "venc" })).json.data).toHaveLength(1);
    expect((await eddie.listTasks({ sort: "priority" })).json.data[0].title).toBe("Vencida");
    expect((await eddie.listTasks({ sort: "due" })).json.data.at(-1).title).toBe("Sin fecha"); // nulls last
    expect((await eddie.listTasks({ from: "2030-03-01", to: "2030-03-31" })).json.data).toHaveLength(1);
    expect((await eddie.listTasks({ status: "bogus" })).status).toBe(400);
    expect((await eddie.createTask({ title: "x", eventId: "00000000-0000-4000-8000-000000000000" })).status).toBe(400);
  });

  it("soft delete + restore y 404 tras borrar", async () => {
    const t = (await eddie.createTask({ title: "Borrable" })).json.data;
    expect((await eddie.deleteTask(t.id)).status).toBe(200);
    expect((await eddie.getTask(t.id)).status).toBe(404);
    expect((await eddie.listTasks({ deleted: "true" })).json.data).toHaveLength(1);
    expect((await eddie.restoreTask(t.id)).status).toBe(200);
    expect((await eddie.getTask(t.id)).status).toBe(200);
    expect((await eddie.restoreTask(t.id)).status).toBe(404); // no está borrada
  });
});

describe("special-dates", () => {
  it("próxima ocurrencia anual, años cumplidos, 29-feb → 28-feb y rango", async () => {
    const bday = await eddie.createSd({ title: "Cumple Ana", type: "birthday", date: "1990-06-10" });
    expect(bday.status).toBe(201);
    expect(bday.json.data.recursYearly).toBe(true);
    expect(bday.json.data.nextOccurrence).toMatch(/^\d{4}-06-10$/);
    expect(bday.json.data.daysUntil).toBeGreaterThanOrEqual(0);
    expect(bday.json.data.yearsSince).toBe(Number(bday.json.data.nextOccurrence.slice(0, 4)) - 1990);
    await eddie.createSd({ title: "Bisiesto", type: "birthday", date: "2000-02-29" });
    await eddie.createSd({ title: "Cita única", type: "personal", date: "2020-01-01" });

    const r = await eddie.listSd({ from: "2031-01-01", to: "2031-12-31", pageSize: 100 });
    const byTitle = Object.fromEntries(r.json.data.map((d: any) => [d.title, d.occurrenceDate]));
    expect(byTitle["Cumple Ana"]).toBe("2031-06-10");
    expect(byTitle["Bisiesto"]).toBe("2031-02-28"); // año no bisiesto
    expect(byTitle["Cita única"]).toBeUndefined(); // no recurrente, ya pasó
    const leap = await eddie.listSd({ from: "2032-02-01", to: "2032-03-01" });
    expect(leap.json.data.find((d: any) => d.title === "Bisiesto").occurrenceDate).toBe("2032-02-29");
    const plain = await eddie.listSd({ sort: "next" });
    expect(plain.json.data.at(-1).nextOccurrence).toBeNull(); // la no recurrente pasada va al final
  });
  it("CRUD, restore y validación", async () => {
    const d = (await eddie.createSd({ title: "Navidad", type: "holiday", date: "2030-12-25" })).json.data;
    expect((await eddie.patchSd(d.id, { title: "Navidad!" })).json.data.title).toBe("Navidad!");
    await eddie.deleteSd(d.id);
    expect((await eddie.getSd(d.id)).status).toBe(404);
    expect((await eddie.restoreSd(d.id)).status).toBe(200);
    expect((await eddie.createSd({ title: "x", date: "2030-13-40" })).status).toBe(400);
    expect((await eddie.listSd({ type: "nada" })).status).toBe(400);
  });
});

describe("reminders", () => {
  it("CRUD de configuración con CHECK de destino y propiedad", async () => {
    const ev = (await eddie.createEvent({ title: "E", startAt: sd("2030-03-04", "09:00") })).json.data;
    const task = (await eddie.createTask({ title: "T" })).json.data;
    const sdate = (await eddie.createSd({ title: "S", date: "2030-05-05" })).json.data;
    const r1 = await eddie.createReminder({ targetType: "event", targetId: ev.id, offsetMinutes: 15, channel: "telegram" });
    expect(r1.status).toBe(201);
    expect(r1.json.data).toMatchObject({ targetType: "event", targetId: ev.id, offsetMinutes: 15, channel: "telegram", isActive: true });
    expect((await eddie.createReminder({ targetType: "task", targetId: task.id, offsetMinutes: 0 })).status).toBe(201);
    expect((await eddie.createReminder({ targetType: "special_date", targetId: sdate.id, offsetMinutes: 1440, channel: "email" })).status).toBe(201);
    expect((await eddie.createReminder({ targetType: "event", targetId: task.id, offsetMinutes: 5 })).status).toBe(400); // tipo no coincide
    expect((await eddie.createReminder({ targetType: "event", targetId: ev.id, offsetMinutes: -5 })).status).toBe(400);
    expect((await eddie.listReminders()).json.pagination.total).toBe(3);
    expect((await eddie.listReminders({ targetType: "event", targetId: ev.id })).json.data).toHaveLength(1);
    const p = await eddie.patchReminder(r1.json.data.id, { isActive: false, offsetMinutes: 30 });
    expect(p.json.data).toMatchObject({ isActive: false, offsetMinutes: 30 });
    expect((await eddie.listReminders({ active: "true" })).json.data).toHaveLength(2);
    expect((await eddie.deleteReminder(r1.json.data.id)).status).toBe(200);
    expect((await eddie.deleteReminder(r1.json.data.id)).status).toBe(404);
    // ajeno
    const other = api({ token: (await createTestActor({ email: "o@test.local" })).token });
    expect((await other.createReminder({ targetType: "event", targetId: ev.id, offsetMinutes: 5 })).status).toBe(400);
  });
});

describe("settings", () => {
  it("GET con valores por defecto, PATCH validado y auditado", async () => {
    const g = await owner.getSettings();
    expect(g.json.data).toMatchObject({ timezone: "America/Santo_Domingo", workDayStart: "08:00", workDayEnd: "18:00", workDays: [1, 2, 3, 4, 5], theme: "system", weekStartsOn: 1 });
    const p = await owner.patchSettings({ theme: "dark", timezone: "America/New_York", defaultReminders: [{ offsetMinutes: 10, channel: "internal" }], notificationEmail: "yo@example.com", workDays: [1, 2, 3] });
    expect(p.json.data).toMatchObject({ theme: "dark", timezone: "America/New_York", workDays: [1, 2, 3] });
    expect((await owner.patchSettings({ timezone: "Nope/Nope" })).status).toBe(400);
    expect((await owner.patchSettings({ workDayStart: "25:00" })).status).toBe(400);
    expect((await owner.patchSettings({ workDays: [1, 1] })).status).toBe(400);
    expect((await owner.patchSettings({ notificationEmail: "no-email" })).status).toBe(400);
    const logs = (await owner.auditLogs({ action: "settings.update" })).json.data;
    expect(logs).toHaveLength(1);
    // El timezone cambia las respuestas
    const e = await owner.createEvent({ title: "NY", startAt: "2030-03-04T14:00:00Z" });
    expect(e.json.data.timezone).toBe("America/New_York");
  });
});
