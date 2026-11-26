import { describe, expect, it } from "vitest";
import { daysBetween, isLeapYear, nextOccurrence, occurrenceInYear, occurrencesBetween, yearsSince } from "@/server/domain/special-dates";
import { resolveRange, toIso, localTime, weekdayName } from "@/server/domain/format";

describe("special-dates", () => {
  it("años bisiestos", () => {
    expect([2000, 2024, 2028].every(isLeapYear)).toBe(true);
    expect([1900, 2025, 2100].some(isLeapYear)).toBe(false);
  });
  it("29-feb → 28-feb en años no bisiestos", () => {
    expect(occurrenceInYear("2000-02-29", 2025)).toBe("2025-02-28");
    expect(occurrenceInYear("2000-02-29", 2028)).toBe("2028-02-29");
    expect(occurrenceInYear("1990-06-10", 2031)).toBe("2031-06-10");
  });
  it("próxima ocurrencia: hoy cuenta, pasada salta al año siguiente, no recurrente", () => {
    expect(nextOccurrence("1990-06-10", true, "2026-06-10")).toBe("2026-06-10");
    expect(nextOccurrence("1990-06-10", true, "2026-06-11")).toBe("2027-06-10");
    expect(nextOccurrence("2000-02-29", true, "2026-03-01")).toBe("2027-02-28");
    expect(nextOccurrence("2000-02-29", true, "2027-03-01")).toBe("2028-02-29");
    expect(nextOccurrence("2020-01-01", false, "2026-01-01")).toBeNull();
    expect(nextOccurrence("2030-01-01", false, "2026-01-01")).toBe("2030-01-01");
  });
  it("ocurrencias en rango multi-año", () => {
    expect(occurrencesBetween("2000-02-29", true, "2026-01-01", "2029-12-31")).toEqual(["2026-02-28", "2027-02-28", "2028-02-29", "2029-02-28"]);
    expect(occurrencesBetween("1990-06-10", true, "2026-06-11", "2027-06-09")).toEqual([]);
    expect(occurrencesBetween("2030-05-05", false, "2030-05-05", "2030-05-05")).toEqual(["2030-05-05"]);
    expect(occurrencesBetween("2030-05-05", true, "2020-01-01", "2029-12-31")).toEqual([]); // antes del año de origen
  });
  it("daysBetween / yearsSince", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(daysBetween("2028-02-27", "2028-03-01")).toBe(3);
    expect(yearsSince("1990-06-10", "2026-06-10")).toBe(36);
  });
});

describe("format", () => {
  it("ISO con offset de la TZ y partes locales", () => {
    const d = new Date("2030-03-05T03:30:00Z");
    expect(toIso(d, "America/Santo_Domingo")).toBe("2030-03-04T23:30:00.000-04:00");
    expect(localTime(d, "America/Santo_Domingo")).toBe("23:30");
    expect(weekdayName("2030-03-04")).toBe("lunes");
  });
  it("resolveRange: fecha → día local (to inclusivo); instante → tal cual", () => {
    const r = resolveRange("2030-03-04", "2030-03-04", "America/Santo_Domingo");
    expect(r.from.toISOString()).toBe("2030-03-04T04:00:00.000Z");
    expect(r.to.toISOString()).toBe("2030-03-05T04:00:00.000Z");
    const i = resolveRange("2030-03-04T10:00:00Z", "2030-03-04T12:00:00Z", "America/Santo_Domingo");
    expect(i.from.toISOString()).toBe("2030-03-04T10:00:00.000Z");
    expect(i.to.toISOString()).toBe("2030-03-04T12:00:00.000Z");
  });
});
