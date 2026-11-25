import type { EventLike } from "@/server/domain/recurrence";

export const TZ = "America/Santo_Domingo"; // UTC-4 sin DST

export function timed(id: string, startIso: string, endIso: string, extra: Partial<EventLike> = {}): EventLike {
  return {
    id,
    title: `Evento ${id}`,
    description: null,
    notes: null,
    isAllDay: false,
    startAt: new Date(startIso),
    endAt: new Date(endIso),
    startDate: null,
    endDate: null,
    timezone: TZ,
    categoryId: null,
    color: null,
    location: null,
    meetingUrl: null,
    meetingProvider: null,
    status: "confirmed",
    isBlocking: false,
    ...extra,
  };
}

export function allDay(id: string, startDate: string, endDateExclusive: string, extra: Partial<EventLike> = {}): EventLike {
  return {
    ...timed(id, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    isAllDay: true,
    startAt: null,
    endAt: null,
    startDate,
    endDate: endDateExclusive,
    ...extra,
  };
}
