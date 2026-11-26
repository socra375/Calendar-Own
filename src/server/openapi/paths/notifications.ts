import { idParam } from "@/lib/validation/common";
import {
  notificationListQuery,
  notificationOut,
  notificationPatchBody,
  notificationTestBody,
  notificationTestOut,
} from "@/lib/validation/notifications";
import { ID, ID2, TS } from "../examples";
import type { OpDef } from "../registry";

const notificationEx = {
  id: ID,
  channel: "internal",
  targetType: "event",
  targetId: ID2,
  occurrenceKey: "2030-03-04T13:00:00.000Z",
  scheduledFor: "2030-03-04T12:45:00.000Z",
  status: "sent",
  attempts: 1,
  lastError: null,
  sentAt: "2030-03-04T12:45:02.000Z",
  title: "Reunión con Ana",
  body: "Reunión con Ana empieza en 15 minutos (09:00).",
  readAt: null,
  createdAt: TS,
};

export const notificationOps: OpDef[] = [
  {
    method: "get", path: "/notifications", tag: "Notifications", summary: "Listar notificaciones (bandeja y entregas)",
    description:
      "Entregas de recordatorios y bandeja interna del usuario, más recientes primero. `meta.unreadCount` = notificaciones ENVIADAS y SIN LEER del canal `internal` " +
      "(la bandeja que muestra la campana), calculado con un único COUNT e independiente de los filtros de la consulta; úsalo para el contador sin pedir datos.",
    query: notificationListQuery, response: notificationOut, paginated: true, responseExample: [notificationEx],
    metaExample: { unreadCount: 3 },
  },
  {
    method: "patch", path: "/notifications/{id}", tag: "Notifications", summary: "Marcar notificación como leída/no leída",
    description: "`{ \"read\": true }` (por defecto) la marca como leída; `{ \"read\": false }` la devuelve a no leída.",
    params: idParam, body: notificationPatchBody, response: notificationOut,
    responseExample: { ...notificationEx, readAt: "2030-03-04T13:00:00.000Z" }, requestExample: { read: true }, errors: [404],
  },
  {
    method: "post", path: "/notifications/test", tag: "Notifications", summary: "Probar un canal de notificación", status: 201,
    description:
      "Envía un mensaje de prueba por el canal indicado con la configuración real y deja una fila en la bandeja. Límite propio de 10 peticiones/min " +
      "(contador independiente del límite general). Sin credenciales: 422 `CHANNEL_NOT_CONFIGURED`; fallo del proveedor: 502 `CHANNEL_DELIVERY_FAILED`.",
    body: notificationTestBody, response: notificationTestOut,
    responseExample: { delivered: true, notification: { ...notificationEx, title: "Notificación de prueba", occurrenceKey: "test:" + ID2 } },
    requestExample: { channel: "internal" }, errors: [429],
  },
];

