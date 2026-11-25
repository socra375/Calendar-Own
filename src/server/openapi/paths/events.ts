import { z } from "zod";
import { idParam } from "@/lib/validation/common";
import {
  availabilityQuery, bulkDeleteQuery, busyOut, eventCreateBody, eventDuplicateBody, eventListQuery, eventOut, eventUpdateBody,
  freeSlotOut, freeSlotsQuery, occurrenceOut, scopeQuery,
} from "@/lib/validation/events";
import { conflictEx, eventEx, ID, occurrenceEx } from "../examples";
import type { OpDef } from "../registry";

const eventDetail = eventOut.extend({
  exceptions: z.array(z.object({ occurrenceKey: z.string(), kind: z.enum(["cancelled", "modified"]), overrides: z.record(z.string(), z.unknown()).nullable() })),
  reminders: z.array(z.object({ id: z.string(), offsetMinutes: z.number(), channel: z.string(), isActive: z.boolean() })),
});
const detailEx = { ...eventEx, exceptions: [], reminders: [{ id: ID, offsetMinutes: 15, channel: "telegram", isActive: true }] };

export const eventOps: OpDef[] = [
  {
    method: "get", path: "/events", tag: "Events", summary: "Listar eventos",
    description: "Con `from` y `to` devuelve las OCURRENCIAS expandidas (series recurrentes incluidas, con excepciones aplicadas), ordenadas por inicio; `meta.expanded=true`. Sin rango devuelve los eventos maestro paginados. `deleted=true` lista la papelera.",
    query: eventListQuery, response: occurrenceOut.or(eventOut) as never, paginated: true, responseExample: [occurrenceEx],
    metaExample: { expanded: true, truncated: false, range: { from: "2030-03-01T00:00:00.000-04:00", to: "2030-04-01T00:00:00.000-04:00", timezone: "America/Santo_Domingo" } },
  },
  {
    method: "post", path: "/events", tag: "Events", summary: "Crear evento", status: 201, errors: [409],
    description: "Evento con hora (`startAt` + `endAt`|`durationMinutes`, por defecto 60 min) o de día completo (`isAllDay`, `startDate`, `endDate` exclusivo). `recurrence` crea una serie. Avisos de solapamiento en `meta.conflicts`; 409 BLOCKING_CONFLICT si choca con un evento bloqueante salvo `force:true`.",
    body: eventCreateBody, response: eventOut, responseExample: eventEx, metaExample: { conflicts: [conflictEx] },
    requestExample: {
      title: "Reunión con Ana", description: "Revisar presupuesto", startAt: "2030-03-04T09:00:00-04:00", durationMinutes: 60,
      location: "Oficina", categoryId: "9c2b6d0e-4a52-4f7e-a1c3-7e0d1f6b2a44", tags: ["finanzas"], isBlocking: false,
      recurrence: { freq: "weekly", interval: 1, byDay: ["MO", "WE"], count: 10 }, reminders: [{ offsetMinutes: 15, channel: "telegram" }], force: false,
    },
  },
  {
    method: "delete", path: "/events", tag: "Events", summary: "Borrado masivo de eventos", errors: [428],
    description: "Requiere la cabecera `X-Confirm-Bulk: true` (si no, 428). Máximo 100 ids. Borrado suave (restaurable).",
    query: bulkDeleteQuery, headers: [{ name: "X-Confirm-Bulk", description: "Debe ser `true`", required: true, example: "true" }],
    response: z.object({ deleted: z.number(), ids: z.array(z.string()), notFoundIds: z.array(z.string()) }),
    responseExample: { deleted: 2, ids: [ID, "9c2b6d0e-4a52-4f7e-a1c3-7e0d1f6b2a44"], notFoundIds: [] },
  },
  { method: "get", path: "/events/{id}", tag: "Events", summary: "Obtener evento", params: idParam, response: eventDetail, responseExample: detailEx, errors: [404] },
  {
    method: "patch", path: "/events/{id}", tag: "Events", summary: "Actualizar evento (con alcance)", errors: [404, 409],
    description: "`scope=all` (def.) edita la serie; `scope=this&occurrenceKey=…` crea una excepción solo para esa ocurrencia (la ocurrencia resultante va en `meta.occurrence`); `scope=following&occurrenceKey=…` cierra la serie antes de esa ocurrencia y crea una nueva desde ella (devuelve la serie nueva). Cambiar hora/recurrencia de la serie reinicia sus excepciones. `recurrence: null` quita la recurrencia.",
    params: idParam, query: scopeQuery, body: eventUpdateBody, response: eventOut, responseExample: eventEx, metaExample: { conflicts: [] },
    requestExample: { title: "Solo hoy", startAt: "2030-03-04T15:00:00-04:00" },
  },
  {
    method: "delete", path: "/events/{id}", tag: "Events", summary: "Eliminar evento (con alcance)", errors: [404],
    description: "`scope=all` borra la serie (suave); `this` cancela una ocurrencia; `following` termina la serie antes de la ocurrencia indicada.",
    params: idParam, query: scopeQuery, response: z.object({ id: z.string(), scope: z.enum(["all", "this", "following"]), occurrenceKey: z.string().optional() }),
    responseExample: { id: ID, scope: "this", occurrenceKey: "2030-03-05T13:00:00.000Z" },
  },
  {
    method: "post", path: "/events/{id}/duplicate", tag: "Events", summary: "Duplicar evento", status: 201, errors: [404, 409],
    description: "Copia datos, etiquetas, recordatorios y recurrencia (no excepciones). Se puede cambiar título y fecha/hora.",
    params: idParam, body: eventDuplicateBody, response: eventOut, responseExample: { ...eventEx, title: "Reunión con Ana (copia)" }, metaExample: { conflicts: [] },
    requestExample: { startAt: "2030-04-01T09:00:00-04:00" },
  },
  { method: "post", path: "/events/{id}/restore", tag: "Events", summary: "Restaurar evento borrado", params: idParam, response: eventDetail, responseExample: detailEx, errors: [404] },
  {
    method: "get", path: "/availability", tag: "Availability", summary: "Disponibilidad (intervalos ocupados)",
    description: "`busy` son intervalos fusionados. Cancelados no ocupan; los de día completo solo si `isBlocking`.",
    query: availabilityQuery,
    response: z.object({ range: z.object({ from: z.string(), to: z.string(), timezone: z.string() }), busy: z.array(busyOut), events: z.array(occurrenceOut), truncated: z.boolean() }),
    responseExample: {
      range: { from: "2030-03-04T00:00:00.000-04:00", to: "2030-03-05T00:00:00.000-04:00", timezone: "America/Santo_Domingo" },
      busy: [{ start: "2030-03-04T09:00:00.000-04:00", end: "2030-03-04T10:00:00.000-04:00", durationMinutes: 60, eventIds: [ID] }],
      events: [occurrenceEx], truncated: false,
    },
  },
  {
    method: "get", path: "/availability/free-slots", tag: "Availability", summary: "Huecos libres",
    description: "Huecos libres maximales con al menos `durationMinutes`; con `withinWorkingHours=true` (def.) se recortan al horario laboral de los ajustes.",
    query: freeSlotsQuery,
    response: z.object({ range: z.object({ from: z.string(), to: z.string(), timezone: z.string() }), durationMinutes: z.number(), withinWorkingHours: z.boolean(), slots: z.array(freeSlotOut) }),
    responseExample: {
      range: { from: "2030-03-04T00:00:00.000-04:00", to: "2030-03-05T00:00:00.000-04:00", timezone: "America/Santo_Domingo" },
      durationMinutes: 60, withinWorkingHours: true,
      slots: [{ start: "2030-03-04T10:00:00.000-04:00", end: "2030-03-04T18:00:00.000-04:00", localDate: "2030-03-04", localStartTime: "10:00", localEndTime: "18:00", durationMinutes: 480 }],
    },
  },
];
