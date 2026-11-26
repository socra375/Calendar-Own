import { beforeEach, describe, expect, it } from "vitest";
import { api, sd } from "../helpers/api";
import { createTestActor, resetDb } from "../helpers";

let eddie: ReturnType<typeof api>;
beforeEach(async () => {
  await resetDb();
  const a = await createTestActor();
  eddie = api({ token: a.token });
  // Lunes 2030-03-04: 09-10, 09:30-11 (se funden), 13-15; cancelado 16-17; día completo no bloqueante
  await eddie.createEvent({ title: "A", startAt: sd("2030-03-04", "09:00"), durationMinutes: 60 });
  await eddie.createEvent({ title: "B", startAt: sd("2030-03-04", "09:30"), durationMinutes: 90 });
  await eddie.createEvent({ title: "C", startAt: sd("2030-03-04", "13:00"), durationMinutes: 120 });
  await eddie.createEvent({ title: "Cancelado", startAt: sd("2030-03-04", "16:00"), durationMinutes: 60, status: "cancelled" });
  await eddie.createEvent({ title: "Día completo", isAllDay: true, startDate: "2030-03-04" });
});

describe("availability", () => {
  it("busy fusionado con eventIds; ignora cancelados y día completo no bloqueante", async () => {
    const r = await eddie.availability({ from: "2030-03-04", to: "2030-03-04" });
    expect(r.status).toBe(200);
    expect(r.json.data.busy).toEqual([
      { start: "2030-03-04T09:00:00.000-04:00", end: "2030-03-04T11:00:00.000-04:00", durationMinutes: 120, eventIds: expect.any(Array) },
      { start: "2030-03-04T13:00:00.000-04:00", end: "2030-03-04T15:00:00.000-04:00", durationMinutes: 120, eventIds: expect.any(Array) },
    ]);
    expect(r.json.data.busy[0].eventIds).toHaveLength(2);
    expect(r.json.data.events.map((e: any) => e.title).sort()).toEqual(["A", "B", "C"]);
  });

  it("día completo bloqueante ocupa el día local completo", async () => {
    await eddie.createEvent({ title: "Viaje", isAllDay: true, startDate: "2030-03-05", isBlocking: true });
    const r = await eddie.availability({ from: "2030-03-05", to: "2030-03-05" });
    expect(r.json.data.busy).toHaveLength(1);
    expect(r.json.data.busy[0]).toMatchObject({ start: "2030-03-05T00:00:00.000-04:00", end: "2030-03-06T00:00:00.000-04:00", durationMinutes: 1440 });
  });

  it("incluye ocurrencias de series y respeta excepciones canceladas", async () => {
    const s = (await eddie.createEvent({ title: "Daily", startAt: sd("2030-03-06", "08:00"), durationMinutes: 30, recurrence: { freq: "daily", count: 3 } })).json.data;
    await eddie.deleteEvent(s.id, { scope: "this", occurrenceKey: "2030-03-07T12:00:00.000Z" });
    const r = await eddie.availability({ from: "2030-03-06", to: "2030-03-08" });
    expect(r.json.data.busy.map((b: any) => b.start.slice(0, 16))).toEqual(["2030-03-06T08:00", "2030-03-08T08:00"]);
  });

  it("validación de parámetros", async () => {
    expect((await eddie.availability({ from: "2030-03-04" })).status).toBe(400);
    expect((await eddie.availability({ from: "2030-03-05", to: "2030-03-04" })).status).toBe(400);
  });
});

describe("free-slots", () => {
  it("dentro del horario laboral (08-18) con duración mínima", async () => {
    const r = await eddie.freeSlots({ from: "2030-03-04", to: "2030-03-04", durationMinutes: 60 });
    expect(r.status).toBe(200);
    expect(r.json.data.slots.map((s: any) => `${s.localStartTime}-${s.localEndTime} (${s.durationMinutes})`)).toEqual([
      "08:00-09:00 (60)",
      "11:00-13:00 (120)",
      "15:00-18:00 (180)",
    ]);
    expect(r.json.data.slots[0]).toMatchObject({ localDate: "2030-03-04", start: "2030-03-04T08:00:00.000-04:00" });
    const long = await eddie.freeSlots({ from: "2030-03-04", to: "2030-03-04", durationMinutes: 150 });
    expect(long.json.data.slots).toHaveLength(1);
  });

  it("withinWorkingHours=false devuelve el día completo libre alrededor; fin de semana sin horario laboral", async () => {
    const r = await eddie.freeSlots({ from: "2030-03-04", to: "2030-03-04", durationMinutes: 60, withinWorkingHours: "false" });
    expect(r.json.data.slots[0].localStartTime).toBe("00:00");
    expect(r.json.data.slots).toHaveLength(3);
    const we = await eddie.freeSlots({ from: "2030-03-09", to: "2030-03-10", durationMinutes: 30 }); // sábado-domingo
    expect(we.json.data.slots).toEqual([]);
  });

  it("respeta settings (horario laboral personalizado)", async () => {
    await eddie.patchSettings({ workDayStart: "10:00", workDayEnd: "12:00" });
    const r = await eddie.freeSlots({ from: "2030-03-04", to: "2030-03-04", durationMinutes: 30 });
    expect(r.json.data.slots.map((s: any) => `${s.localStartTime}-${s.localEndTime}`)).toEqual(["11:00-12:00"]);
  });
});
