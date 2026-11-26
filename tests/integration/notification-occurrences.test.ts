import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { eventExceptions, eventRecurrence, events } from "@/server/db/schema";
import { listOccurrencesInRange } from "@/server/notifications/occurrences";
import { api, sd } from "../helpers/api";
import { createTestActor, resetDb } from "../helpers";

// Las notificaciones deben coincidir EXACTAMENTE con lo que muestra el calendario (misma expansión).
let a: Awaited<ReturnType<typeof createTestActor>>;
let eddie: ReturnType<typeof api>;

beforeEach(async () => {
  await resetDb();
  a = await createTestActor();
  eddie = api({ token: a.token });
});

const base = { title: "Reunión", startAt: sd("2030-03-04", "09:00"), durationMinutes: 60 }; // lunes 13:00Z

/** Ocurrencias que ve el calendario (sin canceladas por estado) vs las que ve el procesador. */
async function parity(from: string, to: string) {
  const cal = await eddie.listEvents({ from, to, pageSize: 100 });
  expect(cal.status).toBe(200);
  const calendar = cal.json.data
    .filter((o: any) => o.status !== "cancelled")
    .map((o: any) => ({ eventId: o.id, key: o.occurrenceKey, start: o.isAllDay ? o.startDate : new Date(o.startAt).toISOString(), title: o.title }));
  const notif = (await listOccurrencesInRange(db, a.user.id, new Date(from), new Date(to))).map((o) => ({
    eventId: o.eventId,
    key: o.occurrenceKey,
    start: o.isAllDay ? o.occurrenceKey : o.start.toISOString(), // el DTO de día completo no trae instante
    title: o.title,
  }));
  const sort = (x: any[]) => [...x].sort((p, q) => p.start.localeCompare(q.start) || p.key.localeCompare(q.key));
  expect(sort(notif)).toEqual(sort(calendar));
  return notif.map((n) => n.key).sort();
}

const RANGE = ["2030-03-01T00:00:00.000Z", "2030-03-15T00:00:00.000Z"] as const;

describe("notificaciones y calendario coinciden", () => {
  it("excepción cancelada", async () => {
    const e = (await eddie.createEvent({ ...base, recurrence: { freq: "daily", count: 4 } })).json.data;
    await eddie.deleteEvent(e.id, { scope: "this", occurrenceKey: "2030-03-05T13:00:00.000Z" });
    const keys = await parity(...RANGE);
    expect(keys).toEqual(["2030-03-04T13:00:00.000Z", "2030-03-06T13:00:00.000Z", "2030-03-07T13:00:00.000Z"]);
  });

  it("excepción movida: clave original, inicio nuevo", async () => {
    const e = (await eddie.createEvent({ ...base, recurrence: { freq: "daily", count: 3 } })).json.data;
    await eddie.patchEvent(e.id, { title: "Movida", startAt: sd("2030-03-05", "15:00") }, { scope: "this", occurrenceKey: "2030-03-05T13:00:00.000Z" });
    await parity(...RANGE);
    const occs = await listOccurrencesInRange(db, a.user.id, new Date(RANGE[0]), new Date(RANGE[1]));
    const moved = occs.find((o) => o.occurrenceKey === "2030-03-05T13:00:00.000Z")!;
    expect(moved.start.toISOString()).toBe("2030-03-05T19:00:00.000Z");
    expect(moved.title).toBe("Movida");
    // una ventana que solo contiene la hora NUEVA también la encuentra, y una que solo contiene la original no
    const onlyNew = await listOccurrencesInRange(db, a.user.id, new Date("2030-03-05T18:00:00Z"), new Date("2030-03-05T20:00:00Z"));
    expect(onlyNew.map((o) => o.occurrenceKey)).toEqual(["2030-03-05T13:00:00.000Z"]);
    const onlyOld = await listOccurrencesInRange(db, a.user.id, new Date("2030-03-05T12:30:00Z"), new Date("2030-03-05T14:30:00Z"));
    expect(onlyOld).toEqual([]);
  });

  it("excepción movida desde fuera de la ventana hacia dentro", async () => {
    const e = (await eddie.createEvent({ ...base, recurrence: { freq: "daily", count: 10 } })).json.data;
    // la ocurrencia del 20 de marzo (fuera) se mueve al 5 de marzo
    await db.insert(eventExceptions).values({
      eventId: e.id, occurrenceKey: "2030-03-13T13:00:00.000Z", kind: "modified",
      overrides: { start: "2030-03-05T22:00:00.000Z", end: "2030-03-05T23:00:00.000Z" },
    });
    const keys = await parity("2030-03-05T21:00:00.000Z", "2030-03-05T23:30:00.000Z");
    expect(keys).toEqual(["2030-03-13T13:00:00.000Z"]);
  });

  it("excepción modified con status cancelled se omite", async () => {
    const e = (await eddie.createEvent({ ...base, recurrence: { freq: "daily", count: 3 } })).json.data;
    const r = await eddie.patchEvent(e.id, { status: "cancelled" }, { scope: "this", occurrenceKey: "2030-03-05T13:00:00.000Z" });
    expect(r.status).toBe(200);
    const keys = await parity(...RANGE);
    expect(keys).toEqual(["2030-03-04T13:00:00.000Z", "2030-03-06T13:00:00.000Z"]);
  });

  it("evento único cancelado no genera ocurrencias", async () => {
    await eddie.createEvent({ ...base, status: "cancelled" });
    await eddie.createEvent({ ...base, title: "Otro", startAt: sd("2030-03-06", "09:00") });
    expect(await parity(...RANGE)).toEqual(["2030-03-06T13:00:00.000Z"]);
  });

  it("serie con COUNT", async () => {
    await eddie.createEvent({ ...base, recurrence: { freq: "weekly", byDay: ["MO", "WE"], count: 3 } });
    expect(await parity("2030-03-01T00:00:00.000Z", "2030-04-30T00:00:00.000Z")).toEqual([
      "2030-03-04T13:00:00.000Z", "2030-03-06T13:00:00.000Z", "2030-03-11T13:00:00.000Z",
    ]);
  });

  it("serie con UNTIL", async () => {
    await eddie.createEvent({ ...base, recurrence: { freq: "daily", until: "2030-03-06" } });
    expect(await parity("2030-03-01T00:00:00.000Z", "2030-04-30T00:00:00.000Z")).toEqual([
      "2030-03-04T13:00:00.000Z", "2030-03-05T13:00:00.000Z", "2030-03-06T13:00:00.000Z",
    ]);
  });

  it("día completo: clave YYYY-MM-DD, con excepción cancelada", async () => {
    const e = (await eddie.createEvent({ title: "Feria", isAllDay: true, startDate: "2030-03-04", endDate: "2030-03-05", recurrence: { freq: "daily", count: 4 } })).json.data;
    await eddie.deleteEvent(e.id, { scope: "this", occurrenceKey: "2030-03-05" });
    const keys = await parity(...RANGE);
    expect(keys).toEqual(["2030-03-04", "2030-03-06", "2030-03-07"]);
    const [first] = await listOccurrencesInRange(db, a.user.id, new Date(RANGE[0]), new Date(RANGE[1]));
    expect(first).toMatchObject({ isAllDay: true, occurrenceKey: "2030-03-04" });
    expect(first!.start.toISOString()).toBe("2030-03-04T04:00:00.000Z"); // medianoche local de Santo Domingo
  });

  it("America/Santo_Domingo cerca de medianoche (23:30 locales = 03:30Z del día siguiente)", async () => {
    await eddie.createEvent({ title: "Tarde", startAt: sd("2030-03-04", "23:30"), durationMinutes: 45, recurrence: { freq: "daily", count: 3 }, timezone: "America/Santo_Domingo" });
    // ventana que corta justo alrededor de la medianoche local/UTC
    const keys = await parity("2030-03-05T03:00:00.000Z", "2030-03-06T04:00:00.000Z");
    expect(keys).toEqual(["2030-03-05T03:30:00.000Z", "2030-03-06T03:30:00.000Z"]);
    const all = await parity(...RANGE);
    expect(all).toEqual(["2030-03-05T03:30:00.000Z", "2030-03-06T03:30:00.000Z", "2030-03-07T03:30:00.000Z"]);
  });

  it("usa solapamiento: un evento en curso al inicio de la ventana se incluye", async () => {
    await eddie.createEvent({ ...base, startAt: sd("2030-03-04", "09:00"), durationMinutes: 120 });
    const occs = await listOccurrencesInRange(db, a.user.id, new Date("2030-03-04T14:00:00Z"), new Date("2030-03-04T16:00:00Z"));
    expect(occs).toHaveLength(1);
  });
});

describe("robustez", () => {
  it("una RRULE inválida se registra sin datos sensibles y no impide procesar el resto", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const [bad] = await db
        .insert(events)
        .values({ userId: a.user.id, title: "Rota secreta", startAt: new Date("2030-03-04T13:00:00Z"), endAt: new Date("2030-03-04T14:00:00Z") })
        .returning();
      await db.insert(eventRecurrence).values({ eventId: bad!.id, rrule: "FREQ=HOURLY;COUNT=5" }); // sub-diaria: no permitida
      await eddie.createEvent({ ...base, title: "Buena", startAt: sd("2030-03-05", "09:00") });
      const occs = await listOccurrencesInRange(db, a.user.id, new Date(RANGE[0]), new Date(RANGE[1]));
      expect(occs.map((o) => o.title)).toEqual(["Buena"]);
      expect(err).toHaveBeenCalledTimes(1);
      const line = String(err.mock.calls[0]![0]);
      expect(line).toContain(bad!.id);
      expect(line).not.toContain("Rota secreta");
      expect(err.mock.calls[0]).toHaveLength(1); // nada de objetos de error crudos
    } finally {
      err.mockRestore();
    }
  });
});
