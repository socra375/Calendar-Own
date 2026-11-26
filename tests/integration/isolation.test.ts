import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { categories, eventExceptions, events, eventTags, reminders, tags, tasks, taskTags } from "@/server/db/schema";
import { api, sd } from "../helpers/api";
import { createTestActor, resetDb } from "../helpers";

// Defensa en profundidad: las consultas auxiliares filtran también por userId. Para probarlo se inyectan
// directamente en BD filas "cruzadas" (imposibles por la API) y se comprueba que el otro usuario no las ve.
let a: Awaited<ReturnType<typeof createTestActor>>;
let b: Awaited<ReturnType<typeof createTestActor>>;
let A: ReturnType<typeof api>;
let B: ReturnType<typeof api>;

beforeEach(async () => {
  await resetDb();
  a = await createTestActor({ email: "a@test.local" });
  b = await createTestActor({ email: "b@test.local" });
  A = api({ token: a.token });
  B = api({ token: b.token });
});

const ev = { title: "Evento", startAt: sd("2030-03-04", "09:00"), durationMinutes: 60, reminders: [] };

describe("aislamiento entre usuarios en consultas auxiliares", () => {
  it("events: tags, categoría, excepciones y recordatorios de otro usuario no se mezclan", async () => {
    const [tagB] = await db.insert(tags).values({ userId: b.user.id, name: "secreto-b" }).returning();
    const [catB] = await db.insert(categories).values({ userId: b.user.id, name: "Cat B" }).returning();
    const e = (await A.createEvent({ ...ev, recurrence: { freq: "daily", count: 3 }, tags: ["propio"] })).json.data;
    await db.insert(eventTags).values({ eventId: e.id, tagId: tagB!.id });
    await db.update(events).set({ categoryId: catB!.id }).where(eq(events.id, e.id));
    await db.insert(reminders).values({ userId: b.user.id, targetType: "event", eventId: e.id, offsetMinutes: 10, channel: "internal" });
    await db.insert(reminders).values({ userId: a.user.id, targetType: "event", eventId: e.id, offsetMinutes: 20, channel: "internal" });

    const got = (await A.getEvent(e.id)).json.data;
    expect(got.tags.map((t: any) => t.name)).toEqual(["propio"]);
    expect(got.category).toBeNull();
    expect(got.reminders.map((r: any) => r.offsetMinutes)).toEqual([20]);

    // la lista expandida tampoco filtra metadatos ajenos
    const list = (await A.listEvents({ from: "2030-03-01", to: "2030-03-10", pageSize: 100 })).json.data;
    expect(list.every((o: any) => o.category === null && o.tags.map((t: any) => t.name).join() === "propio")).toBe(true);

    // duplicar copia solo lo propio
    const dup = (await A.duplicateEvent(e.id, { startAt: sd("2030-04-01", "09:00") })).json.data;
    expect(dup.tags.map((t: any) => t.name)).toEqual(["propio"]);
    expect(dup.reminders.map((r: any) => r.offsetMinutes)).toEqual([20]);
  });

  it("events: el usuario B no puede leer ni tocar el evento de A", async () => {
    const e = (await A.createEvent({ ...ev, recurrence: { freq: "daily", count: 3 } })).json.data;
    await A.deleteEvent(e.id, { scope: "this", occurrenceKey: "2030-03-05T13:00:00.000Z" });
    expect((await B.getEvent(e.id)).status).toBe(404);
    expect((await B.patchEvent(e.id, { title: "x" })).status).toBe(404);
    expect((await B.duplicateEvent(e.id)).status).toBe(404);
    expect((await B.listEvents({ from: "2030-03-01", to: "2030-03-10" })).json.data).toEqual([]);
    expect(await db.select().from(eventExceptions)).toHaveLength(1);
  });

  it("tasks: tags, categoría, evento y recordatorios de otro usuario no se mezclan", async () => {
    const [tagB] = await db.insert(tags).values({ userId: b.user.id, name: "secreto-b" }).returning();
    const [catB] = await db.insert(categories).values({ userId: b.user.id, name: "Cat B" }).returning();
    const eB = (await B.createEvent({ ...ev, title: "Evento de B" })).json.data;
    const t = (await A.createTask({ title: "Tarea", tags: ["propio"], reminders: [] })).json.data;
    await db.update(tasks).set({ categoryId: catB!.id, eventId: eB.id }).where(eq(tasks.id, t.id));
    await db.insert(taskTags).values({ taskId: t.id, tagId: tagB!.id });
    await db.insert(reminders).values({ userId: b.user.id, targetType: "task", taskId: t.id, offsetMinutes: 10, channel: "internal" });
    await db.insert(reminders).values({ userId: a.user.id, targetType: "task", taskId: t.id, offsetMinutes: 20, channel: "internal" });

    const got = (await A.getTask(t.id)).json.data;
    expect(got.tags.map((x: any) => x.name)).toEqual(["propio"]);
    expect(got.category).toBeNull();
    expect(got.event).toBeNull();
    expect(got.reminders.map((r: any) => r.offsetMinutes)).toEqual([20]);
    const listed = (await A.listTasks()).json.data[0];
    expect(listed.category).toBeNull();
    expect(listed.event).toBeNull();
  });

  it("categories.restore: solo restaura la categoría del propio usuario", async () => {
    const c = (await A.createCategory({ name: "Trabajo" })).json.data;
    await A.deleteCategory(c.id);
    expect((await B.restoreCategory(c.id)).status).toBe(404);
    const [still] = await db.select().from(categories).where(eq(categories.id, c.id));
    expect(still!.deletedAt).not.toBeNull();
    expect((await A.restoreCategory(c.id)).status).toBe(200);
    const [back] = await db.select().from(categories).where(and(eq(categories.id, c.id), eq(categories.userId, a.user.id)));
    expect(back!.deletedAt).toBeNull();
  });
});
