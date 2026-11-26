// Ejemplos reutilizables para la documentación OpenAPI.
export const ID = "5d1f3a52-8a53-4c0f-93f5-1d2c9d1e7a10";
export const ID2 = "9c2b6d0e-4a52-4f7e-a1c3-7e0d1f6b2a44";
export const TS = "2030-03-01T12:00:00.000Z";

export const eventEx = {
  id: ID,
  title: "Reunión con Ana",
  description: "Revisar presupuesto",
  notes: null,
  isAllDay: false,
  startAt: "2030-03-04T09:00:00.000-04:00",
  endAt: "2030-03-04T10:00:00.000-04:00",
  startDate: null,
  endDate: null,
  timezone: "America/Santo_Domingo",
  localDate: "2030-03-04",
  localTime: "09:00",
  endLocalDate: "2030-03-04",
  endLocalTime: "10:00",
  durationMinutes: 60,
  categoryId: ID2,
  category: { id: ID2, name: "Trabajo", color: "#3b82f6" },
  color: null,
  location: "Oficina",
  meetingUrl: null,
  meetingProvider: null,
  status: "confirmed",
  isBlocking: false,
  source: "eddie",
  tags: [{ id: ID2, name: "finanzas", color: null }],
  isRecurring: false,
  recurrence: null,
  createdAt: TS,
  updatedAt: TS,
  deletedAt: null,
};

export const recurrenceEx = { rrule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10", freq: "weekly", interval: 1, byDay: ["MO", "WE"], until: null, count: 10, seriesEndAt: "2030-04-03T14:00:00.000Z" };

export const occurrenceEx = {
  ...eventEx,
  isRecurring: true,
  recurrence: recurrenceEx,
  seriesId: ID,
  occurrenceKey: "2030-03-04T13:00:00.000Z",
  isException: false,
};

export const taskEx = {
  id: ID,
  title: "Enviar presupuesto",
  description: null,
  dueAt: "2030-03-03T18:00:00.000-04:00",
  dueLocalDate: "2030-03-03",
  dueLocalTime: "18:00",
  priority: "high",
  status: "pending",
  isOverdue: false,
  categoryId: null,
  category: null,
  eventId: null,
  event: null,
  completedAt: null,
  source: "eddie",
  tags: [],
  createdAt: TS,
  updatedAt: TS,
  deletedAt: null,
};

export const categoryEx = { id: ID2, name: "Trabajo", description: null, color: "#3b82f6", icon: "briefcase", isActive: true, createdAt: TS, updatedAt: TS, deletedAt: null };
export const tagEx = { id: ID2, name: "finanzas", color: "#10b981", createdAt: TS, usage: { events: 3, tasks: 1 } };
export const specialDateEx = {
  id: ID,
  title: "Cumpleaños de Ana",
  type: "birthday",
  date: "1990-06-10",
  recursYearly: true,
  color: null,
  icon: null,
  description: null,
  nextOccurrence: "2030-06-10",
  daysUntil: 99,
  yearsSince: 40,
  createdAt: TS,
  updatedAt: TS,
  deletedAt: null,
};
export const reminderEx = { id: ID, targetType: "event", targetId: ID2, offsetMinutes: 15, channel: "telegram", isActive: true, createdAt: TS, updatedAt: TS };
export const settingsEx = {
  displayName: "Eddie",
  timezone: "America/Santo_Domingo",
  theme: "system",
  weekStartsOn: 1,
  workDayStart: "08:00",
  workDayEnd: "18:00",
  workDays: [1, 2, 3, 4, 5],
  defaultReminders: [{ offsetMinutes: 15, channel: "internal" }],
  telegramEnabled: false,
  telegramChatId: null,
  emailEnabled: false,
  notificationEmail: null,
  updatedAt: TS,
};
export const tokenEx = { id: ID, name: "Eddie prod", tokenPrefix: "pc_AbCdEfGhIj", scopes: ["*"], lastUsedAt: null, expiresAt: null, revokedAt: null, rotatedFromId: null, createdAt: TS };
export const auditEx = { id: ID, actorType: "eddie", apiTokenId: ID2, action: "event.create", resourceType: "event", resourceId: ID, requestId: ID2, result: "success", changes: { title: "Reunión con Ana" }, ip: "203.0.113.5", userAgent: "eddie/1.0", createdAt: TS };

export const agendaItemEx = {
  type: "event",
  id: ID,
  occurrenceKey: "2030-03-04T13:00:00.000Z",
  title: "Reunión con Ana",
  start: "2030-03-04T09:00:00.000-04:00",
  end: "2030-03-04T10:00:00.000-04:00",
  localDate: "2030-03-04",
  localTime: "09:00",
  endLocalTime: "10:00",
  durationMinutes: 60,
  isAllDay: false,
  status: "confirmed",
  location: "Oficina",
  categoryName: "Trabajo",
  color: "#3b82f6",
  extra: { isBlocking: false, isRecurring: false, tags: ["finanzas"], timezone: "America/Santo_Domingo" },
};

export const conflictEx = { eventId: ID2, occurrenceKey: "2030-03-04T13:00:00.000Z", title: "Dentista", start: "2030-03-04T09:00:00.000-04:00", end: "2030-03-04T10:00:00.000-04:00", localDate: "2030-03-04", localStartTime: "09:00", localEndTime: "10:00", isBlocking: false, isAllDay: false };
