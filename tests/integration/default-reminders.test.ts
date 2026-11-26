import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { reminders, userSettings } from "@/server/db/schema";
import { api, sd } from "../helpers/api";
import { createTestActor, resetDb } from "../helpers";

let a: Awaited<ReturnType<typeof createTestActor>>;
let eddie: ReturnType<typeof api>;

const DEFAULTS = [
  { offsetMinutes: 30, channel: "internal" as const },
  { offsetMinutes: 1440, channel: "email" as const },
];
const norm = (rs: { offsetMinutes: number; channel: string }[]) =>
  rs.map((r) => `${r.offsetMinutes}:${r.channel}`).sort();

beforeEach(async () => {
  await resetDb();
  a = await createTestActor();
  eddie = api({ token: a.token });
  await db.update(userSettings).set({ defaultReminders: DEFAULTS }).where(eq(userSettings.userId, a.user.id));
});

const ev = { title: "Cita", startAt: sd("2030-03-04", "09:00"), durationMinutes: 60 };

describe("recordatorios por defecto al crear", () => {
  it("evento sin `reminders`: aplica los defaults", async () => {
    const r = await eddie.createEvent(ev);
    expect(r.status).toBe(201);
    expect(norm(r.json.data.reminders)).toEqual(["1440:email", "30:internal"]);
  });

  it("evento con `reminders` explícitos: solo esos", async () => {
    const r = await eddie.createEvent({ ...ev, reminders: [{ offsetMinutes: 5, channel: "telegram" }] });
    expect(norm(r.json.data.reminders)).toEqual(["5:telegram"]);
  });

  it("evento con `reminders: []`: ninguno", async () => {
    const r = await eddie.createEvent({ ...ev, reminders: [] });
    expect(r.json.data.reminders).toEqual([]);
  });

  it("la UI que precarga los defaults y los envía explícitos no duplica", async () => {
    const r = await eddie.createEvent({ ...ev, reminders: DEFAULTS });
    expect(norm(r.json.data.reminders)).toEqual(["1440:email", "30:internal"]);
    expect(await db.select().from(reminders)).toHaveLength(2);
  });

  it("evento recurrente sin `reminders`: defaults en la serie", async () => {
    const r = await eddie.createEvent({ ...ev, recurrence: { freq: "daily", count: 3 } });
    expect(norm(r.json.data.reminders)).toEqual(["1440:email", "30:internal"]);
  });

  it("sin defaults configurados no crea nada", async () => {
    await db.update(userSettings).set({ defaultReminders: [] }).where(eq(userSettings.userId, a.user.id));
    expect((await eddie.createEvent(ev)).json.data.reminders).toEqual([]);
  });

  it("tarea sin `reminders`: aplica defaults; explícitos y [] se respetan", async () => {
    const none = await eddie.createTask({ title: "T1", dueAt: "2030-03-04T18:00:00-04:00" });
    expect(norm(none.json.data.reminders)).toEqual(["1440:email", "30:internal"]);
    const explicit = await eddie.createTask({ title: "T2", reminders: [{ offsetMinutes: 60, channel: "internal" }] });
    expect(norm(explicit.json.data.reminders)).toEqual(["60:internal"]);
    const empty = await eddie.createTask({ title: "T3", reminders: [] });
    expect(empty.json.data.reminders).toEqual([]);
  });

  it("fecha especial: aplica los defaults (la API no acepta `reminders`)", async () => {
    const r = await eddie.createSd({ title: "Cumple de Ana", type: "birthday", date: "1990-06-10" });
    expect(r.status).toBe(201);
    const rows = await db.select().from(reminders).where(eq(reminders.specialDateId, r.json.data.id));
    expect(norm(rows)).toEqual(["1440:email", "30:internal"]);
    expect(rows.every((x) => x.targetType === "special_date" && x.userId === a.user.id)).toBe(true);
  });

  it("duplicar copia los recordatorios ACTUALES del evento, no los defaults", async () => {
    const src = (await eddie.createEvent({ ...ev, reminders: [{ offsetMinutes: 5, channel: "telegram" }] })).json.data;
    const dup = await eddie.duplicateEvent(src.id, { startAt: sd("2030-03-11", "09:00") });
    expect(dup.status).toBe(201);
    expect(norm(dup.json.data.reminders)).toEqual(["5:telegram"]);
    // un original sin recordatorios se duplica sin recordatorios aunque haya defaults
    const bare = (await eddie.createEvent({ ...ev, title: "Sin", reminders: [] })).json.data;
    const dup2 = await eddie.duplicateEvent(bare.id, { startAt: sd("2030-03-12", "09:00") });
    expect(dup2.json.data.reminders).toEqual([]);
  });

  it("los defaults de un usuario no se aplican a otro", async () => {
    const b = await createTestActor({ email: "otro@test.local" });
    const other = api({ token: b.token });
    expect((await other.createEvent(ev)).json.data.reminders).toEqual([]); // sin defaults propios
  });
});
