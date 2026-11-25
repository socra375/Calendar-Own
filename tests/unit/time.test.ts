import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  allDayToRange,
  endOfLocalDay,
  isValidTimeZone,
  localToUtc,
  relativeRange,
  startOfLocalDay,
  startOfLocalWeek,
  toLocalDate,
  utcToLocal,
  workingWindow,
} from "@/server/domain/time";

const SD = "America/Santo_Domingo"; // UTC-4 sin DST
const NY = "America/New_York";

describe("time", () => {
  it("valida zonas horarias", () => {
    expect(isValidTimeZone(SD)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("convierte local <-> UTC en Santo Domingo", () => {
    expect(localToUtc("2026-03-10T09:00", SD).toISOString()).toBe("2026-03-10T13:00:00.000Z");
    expect(utcToLocal(new Date("2026-03-10T13:00:00Z"), SD)).toBe("2026-03-10T09:00:00");
  });

  it("inicio y fin del día local cruzan medianoche UTC correctamente", () => {
    // 02:00Z del 11 = 22:00 del 10 en SD
    const inst = new Date("2026-03-11T02:00:00Z");
    expect(toLocalDate(inst, SD)).toBe("2026-03-10");
    expect(startOfLocalDay(inst, SD).toISOString()).toBe("2026-03-10T04:00:00.000Z");
    expect(endOfLocalDay(inst, SD).toISOString()).toBe("2026-03-11T03:59:59.999Z");
  });

  it("respeta DST (días de 23 y 25 horas)", () => {
    const spring = startOfLocalDay("2026-03-08", NY); // 05:00Z
    const next = startOfLocalDay("2026-03-09", NY); // 04:00Z (EDT)
    expect((next.getTime() - spring.getTime()) / 3_600_000).toBe(23);
    const fall = startOfLocalDay("2026-11-01", NY);
    const fallNext = startOfLocalDay("2026-11-02", NY);
    expect((fallNext.getTime() - fall.getTime()) / 3_600_000).toBe(25);
  });

  it("addLocalDays cruza mes/año/bisiesto", () => {
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addLocalDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addLocalDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("rangos hoy/mañana usan la TZ del usuario", () => {
    const now = new Date("2026-03-11T02:00:00Z"); // 10-mar 22:00 en SD
    const today = relativeRange("today", SD, now);
    expect(today.from.toISOString()).toBe("2026-03-10T04:00:00.000Z");
    expect(today.to.toISOString()).toBe("2026-03-11T04:00:00.000Z");
    const tomorrow = relativeRange("tomorrow", SD, now);
    expect(tomorrow.from.toISOString()).toBe("2026-03-11T04:00:00.000Z");
  });

  it("rango de semana respeta weekStartsOn", () => {
    expect(startOfLocalWeek("2026-03-11", 1)).toBe("2026-03-09"); // miércoles -> lunes
    expect(startOfLocalWeek("2026-03-11", 0)).toBe("2026-03-08");
    const w = relativeRange("week", SD, new Date("2026-03-11T15:00:00Z"), 1);
    expect(w.from.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-03-16T04:00:00.000Z");
    const nw = relativeRange("next_week", SD, new Date("2026-03-11T15:00:00Z"), 1);
    expect(nw.from.toISOString()).toBe("2026-03-16T04:00:00.000Z");
  });

  it("día completo con end exclusivo", () => {
    const r = allDayToRange("2026-03-10", "2026-03-12", SD);
    expect(r.from.toISOString()).toBe("2026-03-10T04:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-03-12T04:00:00.000Z");
  });

  it("ventana laboral", () => {
    const cfg = { workDayStart: "08:00", workDayEnd: "18:00:00", workDays: [1, 2, 3, 4, 5] };
    const w = workingWindow("2026-03-10", SD, cfg)!; // martes
    expect(w.from.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-03-10T22:00:00.000Z");
    expect(workingWindow("2026-03-14", SD, cfg)).toBeNull(); // sábado
  });

  it("rechaza entradas inválidas", () => {
    expect(() => localToUtc("no-fecha", SD)).toThrow();
  });
});
