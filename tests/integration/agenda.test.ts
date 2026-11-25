import { beforeEach, describe, expect, it } from "vitest";
import { addLocalDays, toLocalDate } from "@/server/domain/time";
import { api, sd } from "../helpers/api";
import { createTestActor, resetDb } from "../helpers";

const TZ = "America/Santo_Domingo";
let eddie: ReturnType<typeof api>;
const today = () => toLocalDate(new Date(), TZ);
const plus = (n: number) => addLocalDays(today(), n);

beforeEach(async () => {
  await resetDb();
  const a = await createTestActor();
  eddie = api({ token: a.token });
});

describe("agenda — qué tengo mañana", () => {
  it("devuelve eventos, tareas y fechas especiales de mañana con campos explícitos", async () => {
    const t = plus(1);
    await eddie.createEvent({ title: "Dentista", startAt: sd(t, "10:00"), durationMinutes: 45, location: "Clínica", tags: ["salud"] });
    await eddie.createEvent({ title: "Retiro", isAllDay: true, startDate: t });
    await eddie.createEvent({ title: "Cancelada", startAt: sd(t, "12:00"), status: "cancelled" });
    await eddie.createEvent({ title: "Pasado mañana", startAt: sd(plus(2), "10:00") });
    await eddie.createTask({ title: "Pagar luz", dueAt: sd(t, "17:00"), priority: "high" });
    await eddie.createSd({ title: "Cumple Pedro", type: "birthday", date: `1985-${t.slice(5)}` });

    const r = await eddie.agenda({ range: "tomorrow" });
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.range).toMatchObject({ kind: "tomorrow", timezone: TZ, localFrom: t, localTo: t });
    expect(d.range.from).toBe(`${t}T00:00:00.000-04:00`);
    expect(d.days).toHaveLength(1);
    const items = d.days[0].items;
    expect(items.map((i: any) => `${i.type}:${i.title}`)).toEqual(["special_date:Cumple Pedro", "event:Retiro", "event:Dentista", "task:Pagar luz"]);
    const dentist = items.find((i: any) => i.title === "Dentista");
    expect(dentist).toMatchObject({ localDate: t, localTime: "10:00", endLocalTime: "10:45", durationMinutes: 45, isAllDay: false, location: "Clínica", start: `${t}T10:00:00.000-04:00` });
    expect(dentist.extra.tags).toEqual(["salud"]);
    expect(items.find((i: any) => i.title === "Pagar luz")).toMatchObject({ localTime: "17:00", extra: { priority: "high" } });
    expect(items.find((i: any) => i.title === "Cumple Pedro").extra.yearsSince).toBe(Number(t.slice(0, 4)) - 1985);
    expect(d.summary).toMatchObject({ events: 2, tasks: 1, specialDates: 1, busyMinutes: 45 });
    expect(d.summary.firstEventStart).toBe(`${t}T10:00:00.000-04:00`);
  });

  it("week/next_week/date/custom y validaciones", async () => {
    await eddie.createEvent({ title: "Hoy", startAt: new Date(Date.now() + 60_000).toISOString() });
    const w = await eddie.agenda({ range: "week" });
    expect(w.json.data.days).toHaveLength(7);
    expect((await eddie.agenda({ range: "next_week" })).json.data.days).toHaveLength(7);
    const day = await eddie.agenda({ range: "date", date: plus(3) });
    expect(day.json.data.range.localFrom).toBe(plus(3));
    expect((await eddie.agenda({ range: "date" })).status).toBe(400);
    const c = await eddie.agenda({ range: "custom", from: plus(0), to: plus(2) });
    expect(c.json.data.days).toHaveLength(3);
    expect((await eddie.agenda({ range: "custom", from: plus(0) })).status).toBe(400);
    expect((await eddie.agenda({ range: "foo" })).status).toBe(400);
    expect((await eddie.agenda({ range: "tomorrow", includeTasks: "false" })).status).toBe(200);
  });

  it("evento multi-día de día completo aparece en cada día; recurrente aparece en el día que toca", async () => {
    await eddie.createEvent({ title: "Congreso", isAllDay: true, startDate: plus(1), endDate: plus(4) });
    await eddie.createEvent({ title: "Daily", startAt: sd(plus(1), "08:00"), durationMinutes: 15, recurrence: { freq: "daily", count: 3 } });
    const r = await eddie.agenda({ range: "custom", from: plus(1), to: plus(3) });
    const names = r.json.data.days.map((d: any) => d.items.map((i: any) => i.title));
    expect(names).toEqual([["Congreso", "Daily"], ["Congreso", "Daily"], ["Congreso", "Daily"]]);
  });
});

describe("dashboard", () => {
  it("próximo evento, tareas, próximo cumpleaños y estructura explícita", async () => {
    const soon = new Date(Date.now() + 3 * 3600_000);
    await eddie.createEvent({ title: "Próxima reunión", startAt: soon.toISOString(), durationMinutes: 30 });
    await eddie.createEvent({ title: "Más tarde", startAt: new Date(Date.now() + 48 * 3600_000).toISOString(), durationMinutes: 30 });
    await eddie.createTask({ title: "Vencida", dueAt: "2020-01-01T10:00:00Z" });
    await eddie.createTask({ title: "Hecha", status: "completed" });
    await eddie.createTask({ title: "En curso", status: "in_progress", dueAt: new Date(Date.now() + 86400_000).toISOString() });
    await eddie.createSd({ title: "Cumple lejano", type: "birthday", date: `1990-${addLocalDays(today(), 40).slice(5)}` });
    await eddie.createSd({ title: "Cumple cercano", type: "birthday", date: `1992-${plus(10).slice(5)}` });
    await eddie.createSd({ title: "Aniversario", type: "anniversary", date: `2010-${plus(5).slice(5)}` });

    const r = await eddie.dashboard();
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.timezone).toBe(TZ);
    expect(d.today.localDate).toBe(today());
    expect(d.generatedAt).toMatch(/-04:00$/);
    expect(d.nextEvent).toMatchObject({ title: "Próxima reunión", type: "event", durationMinutes: 30 });
    expect(d.nextEvent.start).toMatch(/-04:00$/);
    expect(d.upcomingEvents.map((e: any) => e.title)).toEqual(["Próxima reunión", "Más tarde"]);
    expect(d.tasks).toMatchObject({ pending: 1, inProgress: 1, overdue: 1 });
    expect(d.tasks.completedThisWeek).toBe(1);
    expect(d.tasks.overdueList[0]).toMatchObject({ title: "Vencida", extra: { isOverdue: true } });
    expect(d.nextBirthday).toMatchObject({ title: "Cumple cercano", localDate: plus(10), type: "special_date" });
    expect(d.nextBirthday.extra.yearsSince).toBe(Number(plus(10).slice(0, 4)) - 1992 + (plus(10).slice(0, 4) < today().slice(0, 4) ? 1 : 0));
    expect(d.upcomingSpecialDates.map((s: any) => s.title)).toEqual(["Aniversario", "Cumple cercano"]); // dentro de 30 días
    expect(Array.isArray(d.freeSlotsToday)).toBe(true);
    expect(d.counts).toHaveProperty("eventsThisWeek");
  });

  it("sin datos: estructura vacía y nextBirthday null", async () => {
    const d = (await eddie.dashboard()).json.data;
    expect(d).toMatchObject({ nextEvent: null, nextBirthday: null, upcomingEvents: [], upcomingSpecialDates: [], tasks: { pending: 0, overdue: 0 } });
  });
});

describe("search", () => {
  it("busca en eventos, tareas y fechas por título, descripción y etiquetas; filtra por tipo", async () => {
    await eddie.createEvent({ title: "Reunión con Ana", startAt: sd("2030-03-04", "09:00"), description: "Presupuesto anual", tags: ["finanzas"] });
    await eddie.createEvent({ title: "Gimnasio", startAt: sd("2030-03-04", "18:00") });
    await eddie.createTask({ title: "Enviar presupuesto", description: "a Ana", tags: ["Finanzas"] });
    await eddie.createSd({ title: "Cumple de Ana", date: "1991-04-04", type: "birthday" });
    const all = (await eddie.search({ q: "ana" })).json.data;
    expect(all.events.map((e: any) => e.title)).toEqual(["Reunión con Ana"]);
    expect(all.tasks.map((t: any) => t.title)).toEqual(["Enviar presupuesto"]);
    expect(all.specialDates.map((s: any) => s.title)).toEqual(["Cumple de Ana"]);
    expect(all.totals).toEqual({ events: 1, tasks: 1, specialDates: 1 });
    expect((await eddie.search({ q: "presupuesto" })).json.data.totals).toEqual({ events: 1, tasks: 1, specialDates: 0 });
    const byTag = (await eddie.search({ q: "finan" })).json.data;
    expect(byTag.totals).toEqual({ events: 1, tasks: 1, specialDates: 0 });
    expect((await eddie.search({ q: "ana", types: "task" })).json.data.events).toEqual([]);
    expect((await eddie.search({ q: "ana", types: "task" })).json.data.tasks).toHaveLength(1);
    expect((await eddie.search({ q: "" })).status).toBe(400);
    expect((await eddie.search({})).status).toBe(400);
    expect((await eddie.search({ q: "ana", types: "otro" })).status).toBe(400);
    expect((await eddie.search({ q: "zzz" })).json.data.totals).toEqual({ events: 0, tasks: 0, specialDates: 0 });
  });
});
