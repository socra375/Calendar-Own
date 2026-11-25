import { describe, expect, it } from "vitest";
import { computeFreeSlots, mergeBusy, occurrenceToBusy, workingWindowsBetween } from "@/server/domain/availability";
import { blockingConflicts, findConflicts } from "@/server/domain/conflicts";
import { expandOccurrences } from "@/server/domain/recurrence";
import { allDay, timed, TZ } from "./fixtures";

const d = (s: string) => new Date(s);
const day: [Date, Date] = [d("2026-03-02T04:00:00Z"), d("2026-03-03T04:00:00Z")]; // lunes local completo
const occ = (ev: ReturnType<typeof timed>) => expandOccurrences(ev, null, [], ...day)[0]!;
const WORK = { workDayStart: "08:00", workDayEnd: "18:00", workDays: [1, 2, 3, 4, 5] };

describe("busy", () => {
  it("fusiona solapados y contiguos, acumula eventIds", () => {
    const a = occupy("a", "2026-03-02T13:00:00Z", "2026-03-02T14:00:00Z");
    const b = occupy("b", "2026-03-02T13:30:00Z", "2026-03-02T15:00:00Z");
    const c = occupy("c", "2026-03-02T15:00:00Z", "2026-03-02T16:00:00Z"); // contiguo
    const e = occupy("e", "2026-03-02T18:00:00Z", "2026-03-02T19:00:00Z");
    const m = mergeBusy([e, c, a, b]);
    expect(m).toHaveLength(2);
    expect(m[0]!.start.toISOString()).toBe("2026-03-02T13:00:00.000Z");
    expect(m[0]!.end.toISOString()).toBe("2026-03-02T16:00:00.000Z");
    expect(m[0]!.eventIds.sort()).toEqual(["a", "b", "c"]);
  });
  it("cancelados no ocupan; día completo no ocupa salvo is_blocking (y entonces el día local entero)", () => {
    expect(occurrenceToBusy(occ(timed("x", "2026-03-02T13:00:00Z", "2026-03-02T14:00:00Z", { status: "cancelled" })))).toBeNull();
    const ad = expandOccurrences(allDay("ad", "2026-03-02", "2026-03-03"), null, [], ...day)[0]!;
    expect(occurrenceToBusy(ad)).toBeNull();
    const blocking = expandOccurrences(allDay("ad2", "2026-03-02", "2026-03-03", { isBlocking: true }), null, [], ...day)[0]!;
    const b = occurrenceToBusy(blocking)!;
    expect(b.start.toISOString()).toBe("2026-03-02T04:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-03-03T04:00:00.000Z");
  });
  function occupy(id: string, s: string, e: string) {
    return occurrenceToBusy(occ(timed(id, s, e)))!;
  }
});

describe("free slots", () => {
  const busy = mergeBusy(
    [
      timed("a", "2026-03-02T13:00:00Z", "2026-03-02T14:00:00Z"), // 09-10 local
      timed("b", "2026-03-02T17:00:00Z", "2026-03-02T19:00:00Z"), // 13-15 local
    ].map((e) => occurrenceToBusy(occ(e))!),
  );
  it("sin horario laboral: huecos del rango completo", () => {
    const s = computeFreeSlots({ from: day[0], to: day[1], busy, durationMinutes: 60 });
    expect(s.map((x) => [x.start.toISOString(), x.end.toISOString()])).toEqual([
      ["2026-03-02T04:00:00.000Z", "2026-03-02T13:00:00.000Z"],
      ["2026-03-02T14:00:00.000Z", "2026-03-02T17:00:00.000Z"],
      ["2026-03-02T19:00:00.000Z", "2026-03-03T04:00:00.000Z"],
    ]);
  });
  it("dentro del horario laboral 08-18 y con duración mínima", () => {
    const windows = workingWindowsBetween(day[0], day[1], TZ, WORK);
    expect(windows).toHaveLength(1);
    const s = computeFreeSlots({ from: day[0], to: day[1], busy, durationMinutes: 120, windows });
    // 08-09 (60) descartado; 10-13 (180) ok; 15-18 (180) ok
    expect(s.map((x) => [x.start.toISOString(), x.durationMinutes])).toEqual([
      ["2026-03-02T14:00:00.000Z", 180],
      ["2026-03-02T19:00:00.000Z", 180],
    ]);
  });
  it("fin de semana no tiene ventana laboral; recorte parcial del rango", () => {
    expect(workingWindowsBetween(d("2026-03-07T04:00:00Z"), d("2026-03-09T04:00:00Z"), TZ, WORK)).toHaveLength(0);
    const w = workingWindowsBetween(d("2026-03-02T15:00:00Z"), d("2026-03-02T20:00:00Z"), TZ, WORK);
    expect(w).toEqual([{ from: d("2026-03-02T15:00:00Z"), to: d("2026-03-02T20:00:00Z") }]);
  });
  it("todo ocupado -> sin huecos; todo libre -> un hueco", () => {
    const full = mergeBusy([{ eventId: "z", occurrenceKey: "k", start: day[0], end: day[1] }]);
    expect(computeFreeSlots({ from: day[0], to: day[1], busy: full, durationMinutes: 5 })).toHaveLength(0);
    expect(computeFreeSlots({ from: day[0], to: day[1], busy: [], durationMinutes: 5 })).toHaveLength(1);
  });
  it("evento de día completo no bloqueante no afecta los huecos", () => {
    const ad = expandOccurrences(allDay("ad", "2026-03-02", "2026-03-03"), null, [], ...day);
    const m = mergeBusy(ad.map(occurrenceToBusy).filter((x) => x !== null));
    const windows = workingWindowsBetween(day[0], day[1], TZ, WORK);
    expect(computeFreeSlots({ from: day[0], to: day[1], busy: m, durationMinutes: 600, windows })).toHaveLength(1);
  });
});

describe("conflictos", () => {
  const existing = [
    occ(timed("a", "2026-03-02T13:00:00Z", "2026-03-02T14:00:00Z")),
    occ(timed("b", "2026-03-02T15:00:00Z", "2026-03-02T16:00:00Z", { isBlocking: true })),
    occ(timed("c", "2026-03-02T13:00:00Z", "2026-03-02T16:00:00Z", { status: "cancelled" })),
  ];
  it("detecta solapamientos, ignora cancelados y bordes que solo se tocan", () => {
    const c = findConflicts([{ start: d("2026-03-02T13:30:00Z"), end: d("2026-03-02T15:30:00Z") }], existing);
    expect(c.map((x) => x.eventId)).toEqual(["a", "b"]);
    expect(findConflicts([{ start: d("2026-03-02T14:00:00Z"), end: d("2026-03-02T15:00:00Z") }], existing)).toHaveLength(0);
    expect(blockingConflicts(c).map((x) => x.eventId)).toEqual(["b"]);
  });
  it("ignoreEventId excluye el propio evento", () => {
    expect(findConflicts([{ start: d("2026-03-02T13:00:00Z"), end: d("2026-03-02T14:00:00Z") }], existing, { ignoreEventId: "a" })).toHaveLength(0);
  });
  it("día completo solo choca si es bloqueante", () => {
    const soft = expandOccurrences(allDay("s", "2026-03-02", "2026-03-03"), null, [], ...day);
    const hard = expandOccurrences(allDay("h", "2026-03-02", "2026-03-03", { isBlocking: true }), null, [], ...day);
    const cand = [{ start: d("2026-03-02T13:00:00Z"), end: d("2026-03-02T14:00:00Z") }];
    expect(findConflicts(cand, soft)).toHaveLength(0);
    expect(findConflicts(cand, hard).map((x) => x.eventId)).toEqual(["h"]);
  });
  it("candidatos múltiples (serie) sin duplicar conflictos", () => {
    const c = findConflicts(
      [
        { start: d("2026-03-02T13:00:00Z"), end: d("2026-03-02T14:00:00Z") },
        { start: d("2026-03-02T13:30:00Z"), end: d("2026-03-02T14:30:00Z") },
      ],
      existing,
    );
    expect(c).toHaveLength(1);
  });
});
