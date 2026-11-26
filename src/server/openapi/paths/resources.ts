import { z } from "zod";
import { idParam } from "@/lib/validation/common";
import { categoryCreateBody, categoryListQuery, categoryOut, categoryUpdateBody } from "@/lib/validation/categories";
import { tagCreateBody, tagListQuery, tagOut, tagUpdateBody } from "@/lib/validation/tags";
import { specialDateCreateBody, specialDateListQuery, specialDateOccurrenceOut, specialDateOut, specialDateUpdateBody } from "@/lib/validation/special-dates";
import { reminderCreateBody, reminderListQuery, reminderOut, reminderUpdateBody } from "@/lib/validation/reminders";
import { taskCreateBody, taskListQuery, taskOut, taskUpdateBody } from "@/lib/validation/tasks";
import { categoryEx, ID, ID2, reminderEx, specialDateEx, tagEx, taskEx } from "../examples";
import type { OpDef } from "../registry";

const idOnly = z.object({ id: z.string() });
const taskDetail = taskOut.extend({ reminders: z.array(z.object({ id: z.string(), offsetMinutes: z.number(), channel: z.string(), isActive: z.boolean() })) });

export const resourceOps: OpDef[] = [
  // ---- tasks ----
  { method: "get", path: "/tasks", tag: "Tasks", summary: "Listar tareas", description: "Filtros: estado (lista separada por comas), prioridad, categoría, evento, etiqueta, rango de vencimiento, `overdue`, búsqueda `q`.", query: taskListQuery, response: taskOut, paginated: true, responseExample: [taskEx] },
  {
    method: "post", path: "/tasks", tag: "Tasks", summary: "Crear tarea", description: "Recordatorios: si el body NO incluye `reminders` se aplican los recordatorios por defecto del usuario (`defaultReminders` de `/settings`); si lo incluye (incluso `[]`) se respeta tal cual y no se aplican los defaults.", status: 201, body: taskCreateBody, response: taskDetail, responseExample: { ...taskEx, reminders: [] },
    requestExample: { title: "Enviar presupuesto", dueAt: "2030-03-03T18:00:00-04:00", priority: "high", eventId: ID, tags: ["finanzas"], reminders: [{ offsetMinutes: 60, channel: "internal" }] },
  },
  { method: "get", path: "/tasks/{id}", tag: "Tasks", summary: "Obtener tarea", params: idParam, response: taskDetail, responseExample: { ...taskEx, reminders: [] }, errors: [404] },
  { method: "patch", path: "/tasks/{id}", tag: "Tasks", summary: "Actualizar tarea", description: "`status: completed` fija `completedAt` automáticamente; salir de completed lo limpia.", params: idParam, body: taskUpdateBody, response: taskDetail, responseExample: { ...taskEx, status: "completed", completedAt: "2030-03-03T10:00:00.000-04:00", reminders: [] }, requestExample: { status: "completed" }, errors: [404] },
  { method: "delete", path: "/tasks/{id}", tag: "Tasks", summary: "Eliminar tarea (borrado suave)", params: idParam, response: idOnly, responseExample: { id: ID }, errors: [404] },
  { method: "post", path: "/tasks/{id}/restore", tag: "Tasks", summary: "Restaurar tarea", params: idParam, response: taskDetail, responseExample: { ...taskEx, reminders: [] }, errors: [404] },
  // ---- categories ----
  { method: "get", path: "/categories", tag: "Categories", summary: "Listar categorías", query: categoryListQuery, response: categoryOut, paginated: true, responseExample: [categoryEx] },
  { method: "post", path: "/categories", tag: "Categories", summary: "Crear categoría", status: 201, errors: [409], body: categoryCreateBody, response: categoryOut, responseExample: categoryEx, requestExample: { name: "Trabajo", color: "#3b82f6", icon: "briefcase" } },
  { method: "get", path: "/categories/{id}", tag: "Categories", summary: "Obtener categoría", params: idParam, response: categoryOut, responseExample: categoryEx, errors: [404] },
  { method: "patch", path: "/categories/{id}", tag: "Categories", summary: "Actualizar categoría", params: idParam, body: categoryUpdateBody, response: categoryOut, responseExample: categoryEx, requestExample: { name: "Oficina" }, errors: [404, 409] },
  { method: "delete", path: "/categories/{id}", tag: "Categories", summary: "Eliminar categoría (borrado suave)", params: idParam, response: idOnly, responseExample: { id: ID2 }, errors: [404] },
  { method: "post", path: "/categories/{id}/restore", tag: "Categories", summary: "Restaurar categoría", params: idParam, response: categoryOut, responseExample: categoryEx, errors: [404, 409] },
  // ---- tags ----
  { method: "get", path: "/tags", tag: "Tags", summary: "Listar etiquetas (con uso)", query: tagListQuery, response: tagOut, paginated: true, responseExample: [tagEx] },
  { method: "post", path: "/tags", tag: "Tags", summary: "Crear etiqueta", status: 201, errors: [409], body: tagCreateBody, response: tagOut, responseExample: tagEx, requestExample: { name: "finanzas", color: "#10b981" } },
  { method: "get", path: "/tags/{id}", tag: "Tags", summary: "Obtener etiqueta", params: idParam, response: tagOut, responseExample: tagEx, errors: [404] },
  { method: "patch", path: "/tags/{id}", tag: "Tags", summary: "Actualizar etiqueta", params: idParam, body: tagUpdateBody, response: tagOut, responseExample: tagEx, requestExample: { color: "#ef4444" }, errors: [404, 409] },
  { method: "delete", path: "/tags/{id}", tag: "Tags", summary: "Eliminar etiqueta (definitivo)", description: "La etiqueta se quita de los eventos/tareas que la usan.", params: idParam, response: idOnly, responseExample: { id: ID2 }, errors: [404] },
  // ---- special dates ----
  {
    method: "get", path: "/special-dates", tag: "Special dates", summary: "Listar fechas especiales",
    description: "Cada ítem incluye `nextOccurrence`, `daysUntil` y `yearsSince`. Con `from`+`to` devuelve las ocurrencias dentro del rango (`occurrenceDate`). 29-feb se celebra el 28-feb en años no bisiestos.",
    query: specialDateListQuery, response: specialDateOccurrenceOut.or(specialDateOut) as never, paginated: true, responseExample: [specialDateEx],
  },
  { method: "post", path: "/special-dates", tag: "Special dates", summary: "Crear fecha especial", description: "Esta API no acepta `reminders`: al crear la fecha se aplican siempre los recordatorios por defecto del usuario (`defaultReminders` de `/settings`). El disparo se calcula desde `workDayStart` del día. Ajusta después con `/reminders`.", status: 201, body: specialDateCreateBody, response: specialDateOut, responseExample: specialDateEx, requestExample: { title: "Cumpleaños de Ana", type: "birthday", date: "1990-06-10" } },
  { method: "get", path: "/special-dates/{id}", tag: "Special dates", summary: "Obtener fecha especial", params: idParam, response: specialDateOut, responseExample: specialDateEx, errors: [404] },
  { method: "patch", path: "/special-dates/{id}", tag: "Special dates", summary: "Actualizar fecha especial", params: idParam, body: specialDateUpdateBody, response: specialDateOut, responseExample: specialDateEx, requestExample: { title: "Cumple de Ana" }, errors: [404] },
  { method: "delete", path: "/special-dates/{id}", tag: "Special dates", summary: "Eliminar fecha especial (borrado suave)", params: idParam, response: idOnly, responseExample: { id: ID }, errors: [404] },
  { method: "post", path: "/special-dates/{id}/restore", tag: "Special dates", summary: "Restaurar fecha especial", params: idParam, response: specialDateOut, responseExample: specialDateEx, errors: [404] },
  // ---- reminders ----
  { method: "get", path: "/reminders", tag: "Reminders", summary: "Listar recordatorios (configuración)", query: reminderListQuery, response: reminderOut, paginated: true, responseExample: [reminderEx] },
  { method: "post", path: "/reminders", tag: "Reminders", summary: "Crear recordatorio", description: "`offsetMinutes` = minutos ANTES del inicio/vencimiento.", status: 201, body: reminderCreateBody, response: reminderOut, responseExample: reminderEx, requestExample: { targetType: "event", targetId: ID2, offsetMinutes: 15, channel: "telegram" } },
  { method: "get", path: "/reminders/{id}", tag: "Reminders", summary: "Obtener recordatorio", params: idParam, response: reminderOut, responseExample: reminderEx, errors: [404] },
  { method: "patch", path: "/reminders/{id}", tag: "Reminders", summary: "Actualizar recordatorio", params: idParam, body: reminderUpdateBody, response: reminderOut, responseExample: reminderEx, requestExample: { isActive: false }, errors: [404] },
  { method: "delete", path: "/reminders/{id}", tag: "Reminders", summary: "Eliminar recordatorio", params: idParam, response: idOnly, responseExample: { id: ID }, errors: [404] },
];
