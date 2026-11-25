import { describe, expect, it } from "vitest";
import {
  buildRrule,
  computeSeriesEnd,
  expandOccurrences,
  expandWithMeta,
  isValidOccurrenceKey,
  occurrenceForKey,
  splitRrule,
  summarizeRrule,
  validateRrule,
  eventDtstart,
} from "@/server/domain/recurrence";
import { allDay, timed, TZ } from "./fixtures";

const d = (s: string) => new Date(s);
// 09:00 locales (UTC-4) = 13:00Z
const daily = timed("e1", "2026-03-02T13:00:00Z", "2026-03-02T14:00:00Z");

describe("expandOccurrences — evento único", () => {
  it("devuelve la ocurrencia si solapa y vacío si no", () => {
    const ev = timed("x", "2026-03-02T13:00:00Z", "2026-03-02T14:00:00Z");
    expect(expandOccurrences(ev, null, [], d("2026-03-02T00:00:00Z"), d("2026-03-03T00:00:00Z"))).toHaveLength(1);
    expect(expandOccurrences(ev, null, [], d("2026-03-03T00:00:00Z"), d("2026-03-04T00:00:00Z"))).toHaveLength(0);
    // borde: termina exactamente cuando empieza el rango -> no solapa
    expect(expandOccurrences(ev, null, [], d("2026-03-02T14:00:00Z"), d("2026-03-03T00:00:00Z"))).toHaveLength(0);
  });
  it("no es recurrente: seriesId null, key = ISO UTC", () => {
    const [o] = expandOccurrences(daily, null, [], d("2026-03-01T00:00:00Z"), d("2026-03-10T00:00:00Z"));
    expect(o!.isRecurring).toBe(false);
    expect(o!.seriesId).toBeNull();
    expect(o!.occurrenceKey).toBe("2026-03-02T13:00:00.000Z");
  });
});

describe("expandOccurrences — frecuencias", () => {
  it("diaria con INTERVAL=2", () => {
    const rrule = buildRrule({ freq: "daily", interval: 2 }, TZ);
    const occ = expandOccurrences(daily, { rrule }, [], d("2026-03-01T00:00:00Z"), d("2026-03-10T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      "2026-03-02T13:00:00.000Z",
      "2026-03-04T13:00:00.000Z",
      "2026-03-06T13:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
    ]);
    expect(occ.every((o) => o.isRecurring && o.seriesId === "e1")).toBe(true);
    expect(occ[0]!.end.toISOString()).toBe("2026-03-02T14:00:00.000Z");
  });

  it("semanal con BYDAY (lunes/miércoles) respeta el día local", () => {
    // 2026-03-02 es lunes
    const rrule = buildRrule({ freq: "weekly", byDay: ["MO", "WE"] }, TZ);
    expect(rrule).toContain("BYDAY=MO,WE");
    const occ = expandOccurrences(daily, { rrule }, [], d("2026-03-01T00:00:00Z"), d("2026-03-16T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual([
      "2026-03-02", "2026-03-04", "2026-03-09", "2026-03-11",
    ]);
  });

  it("mensual (día 15) y anual", () => {
    const ev = timed("m", "2026-01-15T15:00:00Z", "2026-01-15T16:00:00Z");
    const monthly = expandOccurrences(ev, { rrule: buildRrule({ freq: "monthly" }, TZ) }, [], d("2026-01-01T00:00:00Z"), d("2026-05-01T00:00:00Z"));
    expect(monthly.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
    const yearly = expandOccurrences(ev, { rrule: buildRrule({ freq: "yearly" }, TZ) }, [], d("2026-01-01T00:00:00Z"), d("2029-01-01T00:00:00Z"));
    expect(yearly.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2026-01-15", "2027-01-15", "2028-01-15"]);
  });

  it("custom: primer lunes de cada mes", () => {
    const ev = timed("c", "2026-03-02T13:00:00Z", "2026-03-02T14:00:00Z");
    const rrule = buildRrule({ freq: "custom", rrule: "FREQ=MONTHLY;BYDAY=1MO" }, TZ);
    const occ = expandOccurrences(ev, { rrule }, [], d("2026-03-01T00:00:00Z"), d("2026-06-01T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2026-03-02", "2026-04-06", "2026-05-04"]);
  });
});

describe("COUNT / UNTIL / series_end_at", () => {
  it("COUNT limita el total aunque el rango sea enorme", () => {
    const rrule = buildRrule({ freq: "daily", count: 5 }, TZ);
    const occ = expandOccurrences(daily, { rrule }, [], d("2026-01-01T00:00:00Z"), d("2030-01-01T00:00:00Z"));
    expect(occ).toHaveLength(5);
  });
  it("UNTIL (fecha local) es inclusivo", () => {
    const rrule = buildRrule({ freq: "daily", until: "2026-03-05" }, TZ);
    const occ = expandOccurrences(daily, { rrule }, [], d("2026-03-01T00:00:00Z"), d("2026-04-01T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]);
  });
  it("computeSeriesEnd: COUNT -> fin de la última; UNTIL -> última ocurrencia; infinita -> null", () => {
    expect(computeSeriesEnd(daily, buildRrule({ freq: "daily", count: 3 }, TZ))!.toISOString()).toBe("2026-03-04T14:00:00.000Z");
    expect(computeSeriesEnd(daily, buildRrule({ freq: "daily", until: "2026-03-05" }, TZ))!.toISOString()).toBe("2026-03-05T14:00:00.000Z");
    expect(computeSeriesEnd(daily, buildRrule({ freq: "daily" }, TZ))).toBeNull();
  });
  it("un rango anterior al inicio no genera nada", () => {
    const rrule = buildRrule({ freq: "daily" }, TZ);
    expect(expandOccurrences(daily, { rrule }, [], d("2025-01-01T00:00:00Z"), d("2026-03-02T00:00:00Z"))).toHaveLength(0);
  });
});

describe("zona horaria", () => {
  it("evento a las 23:30 locales (03:30Z del día siguiente) conserva la hora local cada día", () => {
    const ev = timed("n", "2026-03-03T03:30:00Z", "2026-03-03T04:30:00Z"); // 23:30 del 2 de marzo local
    const occ = expandOccurrences(ev, { rrule: "FREQ=DAILY;COUNT=3" }, [], d("2026-03-01T00:00:00Z"), d("2026-03-10T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      "2026-03-03T03:30:00.000Z",
      "2026-03-04T03:30:00.000Z",
      "2026-03-05T03:30:00.000Z",
    ]);
  });
  it("DST (America/New_York): 09:00 local se mantiene aunque cambie el offset UTC", () => {
    const ny = "America/New_York";
    // 2026-03-07 09:00 EST = 14:00Z; DST empieza el 8 de marzo -> 09:00 EDT = 13:00Z
    const ev = timed("ny", "2026-03-07T14:00:00Z", "2026-03-07T15:00:00Z", { timezone: ny });
    const occ = expandOccurrences(ev, { rrule: "FREQ=DAILY;COUNT=3" }, [], d("2026-03-06T00:00:00Z"), d("2026-03-12T00:00:00Z"), ny);
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
    ]);
  });
  it("rango que empieza a medianoche local incluye evento nocturno del día", () => {
    const ev = timed("n2", "2026-03-03T03:30:00Z", "2026-03-03T04:30:00Z");
    // 'día local 2026-03-02' = [2026-03-02T04:00Z, 2026-03-03T04:00Z)
    const r = expandOccurrences(ev, null, [], d("2026-03-02T04:00:00Z"), d("2026-03-03T04:00:00Z"));
    expect(r).toHaveLength(1);
  });
});

describe("día completo", () => {
  it("ocurrencias diarias de un evento de 2 días: claves YYYY-MM-DD y límites de día local", () => {
    const ev = allDay("a", "2026-03-02", "2026-03-04");
    const occ = expandOccurrences(ev, { rrule: "FREQ=WEEKLY;COUNT=2" }, [], d("2026-03-01T00:00:00Z"), d("2026-03-30T00:00:00Z"));
    expect(occ.map((o) => o.occurrenceKey)).toEqual(["2026-03-02", "2026-03-09"]);
    expect(occ[0]!.start.toISOString()).toBe("2026-03-02T04:00:00.000Z");
    expect(occ[0]!.end.toISOString()).toBe("2026-03-04T04:00:00.000Z");
    expect(occ[0]!.startDate).toBe("2026-03-02");
    expect(occ[0]!.endDate).toBe("2026-03-04");
  });
  it("cumpleaños anual de día completo", () => {
    const ev = allDay("b", "2026-06-10", "2026-06-11");
    const occ = expandOccurrences(ev, { rrule: "FREQ=YEARLY" }, [], d("2026-01-01T00:00:00Z"), d("2028-12-31T00:00:00Z"));
    expect(occ.map((o) => o.occurrenceKey)).toEqual(["2026-06-10", "2027-06-10", "2028-06-10"]);
  });
});

describe("excepciones", () => {
  const rrule = "FREQ=DAILY;COUNT=5";
  const range: [Date, Date] = [d("2026-03-01T00:00:00Z"), d("2026-03-31T00:00:00Z")];
  it("cancelled omite solo esa ocurrencia", () => {
    const occ = expandOccurrences(daily, { rrule }, [{ occurrenceKey: "2026-03-04T13:00:00.000Z", kind: "cancelled" }], ...range);
    expect(occ).toHaveLength(4);
    expect(occ.some((o) => o.occurrenceKey === "2026-03-04T13:00:00.000Z")).toBe(false);
  });
  it("modified aplica título/ubicación y marca isException; la clave original se conserva", () => {
    const occ = expandOccurrences(
      daily,
      { rrule },
      [{ occurrenceKey: "2026-03-03T13:00:00.000Z", kind: "modified", overrides: { title: "Cambiado", location: "Sala 2" } }],
      ...range,
    );
    const m = occ.find((o) => o.occurrenceKey === "2026-03-03T13:00:00.000Z")!;
    expect(m.title).toBe("Cambiado");
    expect(m.location).toBe("Sala 2");
    expect(m.isException).toBe(true);
    expect(occ.filter((o) => o.isException)).toHaveLength(1);
  });
  it("modified con nueva hora de inicio conserva la duración y sale aunque el original quede fuera de ventana", () => {
    const exc = [{ occurrenceKey: "2026-03-03T13:00:00.000Z", kind: "modified" as const, overrides: { start: "2026-03-20T15:00:00.000Z" } }];
    const near = expandOccurrences(daily, { rrule }, exc, d("2026-03-03T00:00:00Z"), d("2026-03-04T00:00:00Z"));
    expect(near).toHaveLength(0); // movida fuera
    const far = expandOccurrences(daily, { rrule }, exc, d("2026-03-20T00:00:00Z"), d("2026-03-21T00:00:00Z"));
    expect(far).toHaveLength(1);
    expect(far[0]!.start.toISOString()).toBe("2026-03-20T15:00:00.000Z");
    expect(far[0]!.end.toISOString()).toBe("2026-03-20T16:00:00.000Z");
    expect(far[0]!.occurrenceKey).toBe("2026-03-03T13:00:00.000Z");
  });
  it("override de status cancelled mantiene la ocurrencia pero con estado cancelled", () => {
    const occ = expandOccurrences(daily, { rrule }, [{ occurrenceKey: "2026-03-03T13:00:00.000Z", kind: "modified", overrides: { status: "cancelled" } }], ...range);
    expect(occ.find((o) => o.occurrenceKey === "2026-03-03T13:00:00.000Z")!.status).toBe("cancelled");
  });
  it("excepción sobre día completo", () => {
    const ev = allDay("a2", "2026-03-02", "2026-03-03");
    const occ = expandOccurrences(ev, { rrule: "FREQ=DAILY;COUNT=3" }, [{ occurrenceKey: "2026-03-03", kind: "cancelled" }], ...range);
    expect(occ.map((o) => o.occurrenceKey)).toEqual(["2026-03-02", "2026-03-04"]);
  });
});

describe("límite de seguridad", () => {
  it("trunca y avisa cuando se supera maxOccurrences", () => {
    const r = expandWithMeta(daily, { rrule: "FREQ=DAILY" }, [], d("2026-03-01T00:00:00Z"), d("2036-03-01T00:00:00Z"), TZ, 50);
    expect(r.truncated).toBe(true);
    expect(r.occurrences.length).toBeLessThanOrEqual(50);
  });
  it("rango normal no se trunca", () => {
    const r = expandWithMeta(daily, { rrule: "FREQ=DAILY" }, [], d("2026-03-01T00:00:00Z"), d("2026-04-01T00:00:00Z"));
    expect(r.truncated).toBe(false);
    expect(r.occurrences).toHaveLength(30);
  });
});

describe("validación y utilidades de RRULE", () => {
  it("rechaza reglas inválidas o peligrosas", () => {
    expect(() => validateRrule("FOO=BAR")).toThrow(RangeError);
    expect(() => validateRrule("FREQ=HOURLY")).toThrow(/DAILY/);
    expect(() => validateRrule("FREQ=SECONDLY;COUNT=10")).toThrow();
    expect(() => validateRrule("FREQ=DAILY;COUNT=99999")).toThrow();
    expect(() => validateRrule("DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY")).toThrow();
    expect(() => validateRrule("FREQ=DAILY;INTERVAL=0")).toThrow();
    expect(() => validateRrule("FREQ=WEEKLY;BYDAY=MO;COUNT=4")).not.toThrow();
  });
  it("summarizeRrule", () => {
    expect(summarizeRrule(buildRrule({ freq: "weekly", interval: 2, byDay: ["TU", "TH"], count: 6 }, TZ))).toEqual({
      freq: "weekly", interval: 2, byDay: ["TU", "TH"], until: null, count: 6,
    });
    expect(summarizeRrule(buildRrule({ freq: "daily", until: "2026-12-31" }, TZ)).until).toBe("2026-12-31");
  });
  it("splitRrule: cabeza con UNTIL y cola con COUNT restante", () => {
    const dtstart = eventDtstart(daily);
    const split = new Date(Date.UTC(2026, 2, 5, 9, 0, 0)); // 5 de marzo 09:00 flotante
    const { head, tail } = splitRrule("FREQ=DAILY;COUNT=10", dtstart, split);
    expect(head).toContain("UNTIL=20260305T085959Z");
    expect(head).not.toContain("COUNT");
    expect(tail).toBe("FREQ=DAILY;COUNT=7"); // 2,3,4 quedan en la cabeza
    const only = splitRrule("FREQ=DAILY;COUNT=3", dtstart, new Date(Date.UTC(2026, 2, 5, 9, 0, 0)));
    expect(only.tail).toBeNull();
    expect(splitRrule("FREQ=DAILY", dtstart, split).tail).toBe("FREQ=DAILY");
  });
  it("isValidOccurrenceKey / occurrenceForKey", () => {
    const rec = { rrule: "FREQ=DAILY;COUNT=3" };
    expect(isValidOccurrenceKey(daily, rec.rrule, "2026-03-03T13:00:00.000Z")).toBe(true);
    expect(isValidOccurrenceKey(daily, rec.rrule, "2026-03-03T14:00:00.000Z")).toBe(false);
    expect(isValidOccurrenceKey(daily, rec.rrule, "2026-03-09T13:00:00.000Z")).toBe(false);
    expect(isValidOccurrenceKey(daily, rec.rrule, "basura")).toBe(false);
    expect(occurrenceForKey(daily, rec, [], "2026-03-03T13:00:00.000Z")!.start.toISOString()).toBe("2026-03-03T13:00:00.000Z");
    expect(occurrenceForKey(daily, rec, [{ occurrenceKey: "2026-03-03T13:00:00.000Z", kind: "cancelled" }], "2026-03-03T13:00:00.000Z")).toBeNull();
    expect(isValidOccurrenceKey(allDay("z", "2026-03-02", "2026-03-03"), "FREQ=DAILY;COUNT=2", "2026-03-03")).toBe(true);
  });
});
