import { z } from "zod";
import { idParam } from "@/lib/validation/common";
import { agendaOut, agendaQuery, dashboardOut } from "@/lib/validation/agenda";
import { auditListQuery, auditOut } from "@/lib/validation/audit-logs";
import { searchOut, searchQuery } from "@/lib/validation/search";
import { settingsOut, settingsUpdateBody } from "@/lib/validation/settings";
import { tokenCreateBody, tokenCreatedOut, tokenOut } from "@/lib/validation/tokens";
import { agendaItemEx, auditEx, eventEx, ID, settingsEx, specialDateEx, taskEx, tokenEx } from "../examples";
import type { OpDef } from "../registry";

const TZ = "America/Santo_Domingo";
const tomorrow = { ...agendaItemEx, localDate: "2030-03-05" };

export const miscOps: OpDef[] = [
  {
    method: "get", path: "/agenda", tag: "Agenda", summary: "Agenda por día (hoy, mañana, semana…)",
    description: "Responde a «¿qué tengo mañana?»: `range=tomorrow`. Agrupa eventos (expandidos), tareas con vencimiento y fechas especiales por día local. Los eventos cancelados no aparecen.",
    query: agendaQuery, response: agendaOut,
    responseExample: {
      range: { kind: "tomorrow", timezone: TZ, from: "2030-03-05T00:00:00.000-04:00", to: "2030-03-06T00:00:00.000-04:00", localFrom: "2030-03-05", localTo: "2030-03-05" },
      days: [{ localDate: "2030-03-05", weekday: "martes", items: [tomorrow] }],
      summary: { events: 1, tasks: 0, specialDates: 0, busyMinutes: 60, firstEventStart: tomorrow.start, lastEventEnd: tomorrow.end },
    },
  },
  {
    method: "get", path: "/dashboard", tag: "Agenda", summary: "Resumen del panel",
    description: "Agenda de hoy, próximo evento, próximos eventos, estadísticas de tareas, fechas especiales próximas (30 días), próximo cumpleaños y huecos libres de hoy.",
    response: dashboardOut,
    responseExample: {
      generatedAt: "2030-03-04T08:00:00.000-04:00", timezone: TZ, today: { localDate: "2030-03-04", weekday: "lunes" },
      todayAgenda: [agendaItemEx], nextEvent: agendaItemEx, upcomingEvents: [agendaItemEx],
      tasks: { pending: 3, inProgress: 1, overdue: 1, dueToday: 1, completedThisWeek: 4, overdueList: [{ ...agendaItemEx, type: "task", title: taskEx.title }], dueSoon: [] },
      upcomingSpecialDates: [], nextBirthday: { ...agendaItemEx, type: "special_date", title: specialDateEx.title, isAllDay: true },
      freeSlotsToday: [{ start: "2030-03-04T10:00:00.000-04:00", end: "2030-03-04T18:00:00.000-04:00", durationMinutes: 480 }],
      counts: { eventsToday: 1, eventsThisWeek: 5 },
    },
  },
  {
    method: "get", path: "/search", tag: "Search", summary: "Búsqueda global", description: "Busca por título, descripción, notas, ubicación y etiquetas en eventos, tareas y fechas especiales.",
    query: searchQuery, response: searchOut, responseExample: { query: "ana", events: [eventEx], tasks: [taskEx], specialDates: [specialDateEx], totals: { events: 1, tasks: 1, specialDates: 1 } },
  },
  { method: "get", path: "/settings", tag: "Settings", summary: "Obtener ajustes", response: settingsOut, responseExample: settingsEx },
  { method: "patch", path: "/settings", tag: "Settings", summary: "Actualizar ajustes", body: settingsUpdateBody, response: settingsOut, responseExample: settingsEx, requestExample: { timezone: "America/Santo_Domingo", workDayStart: "09:00", workDayEnd: "17:00" } },
  { method: "get", path: "/tokens", tag: "Tokens", summary: "Listar tokens de API", description: "Solo sesión de usuario. Nunca devuelve el valor del token.", auth: "session", response: z.array(tokenOut), responseExample: [tokenEx] },
  {
    method: "post", path: "/tokens", tag: "Tokens", summary: "Crear token de API", description: "Solo sesión. El valor completo (`token`) se muestra UNA sola vez.", auth: "session", status: 201,
    body: tokenCreateBody, response: tokenCreatedOut, responseExample: { token: "pc_" + "A".repeat(43), record: tokenEx }, requestExample: { name: "Eddie prod", scopes: ["*"], expiresAt: null },
  },
  { method: "post", path: "/tokens/{id}/rotate", tag: "Tokens", summary: "Rotar token", description: "Revoca el token y devuelve uno nuevo con el mismo nombre/permisos. Solo sesión.", auth: "session", status: 201, params: idParam, response: tokenCreatedOut, responseExample: { token: "pc_" + "B".repeat(43), record: { ...tokenEx, rotatedFromId: ID } }, errors: [404] },
  { method: "delete", path: "/tokens/{id}", tag: "Tokens", summary: "Revocar token", auth: "session", params: idParam, response: tokenOut, responseExample: { ...tokenEx, revokedAt: "2030-03-04T12:00:00.000Z" }, errors: [404] },
  {
    method: "get", path: "/audit-logs", tag: "Audit", summary: "Buscar en el log de auditoría", description: "`action` acepta prefijo con `*` (p. ej. `event.*`). Los cambios están redactados: nunca contienen tokens ni contraseñas.",
    query: auditListQuery, response: auditOut, paginated: true, responseExample: [auditEx],
  },
  {
    method: "get", path: "/openapi.json", tag: "Docs", summary: "Especificación OpenAPI", auth: "public",
    description: "Este documento. Respuesta JSON OpenAPI 3.1 sin envelope.", response: z.object({ openapi: z.string() }).passthrough(), responseExample: { openapi: "3.1.0" },
  },
];
