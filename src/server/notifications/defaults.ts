import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { reminders, userSettings } from "../db/schema";

export type ReminderTarget =
  | { type: "event"; id: string }
  | { type: "task"; id: string }
  | { type: "special_date"; id: string };

const CHANNELS = new Set(["internal", "telegram", "email"]);

/**
 * Crea los recordatorios por defecto (`user_settings.default_reminders`) para un destino recién creado.
 * Se llama dentro de la misma transacción que crea el evento/tarea/fecha especial, y SOLO cuando la petición no
 * trae `reminders` explícitos (ver `createEvent`/`createTask`/`createSpecialDate`; un `reminders: []` explícito se respeta):
 *   await tx.insert(events).values(…).returning(); await applyDefaultReminders(tx, userId, { type: "event", id });
 *
 * - Idempotente: no duplica un (offset, canal) que el destino ya tenga; ignora duplicados y entradas inválidas
 *   (offset no entero o negativo, canal desconocido) dentro de la propia configuración.
 * - Devuelve solo las filas insertadas. Sin configuración de usuario → [].
 */
export async function applyDefaultReminders(tx: DbOrTx, userId: string, target: ReminderTarget) {
  const [settings] = await tx
    .select({ defaultReminders: userSettings.defaultReminders })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const defaults = settings?.defaultReminders ?? [];
  if (!defaults.length) return [];

  const col =
    target.type === "event" ? reminders.eventId : target.type === "task" ? reminders.taskId : reminders.specialDateId;
  const existing = await tx
    .select({ offsetMinutes: reminders.offsetMinutes, channel: reminders.channel })
    .from(reminders)
    .where(and(eq(reminders.userId, userId), eq(col, target.id)));
  const seen = new Set(existing.map((r) => `${r.offsetMinutes}:${r.channel}`));

  const values: (typeof reminders.$inferInsert)[] = [];
  for (const d of defaults) {
    if (!Number.isInteger(d.offsetMinutes) || d.offsetMinutes < 0 || !CHANNELS.has(d.channel)) continue;
    const k = `${d.offsetMinutes}:${d.channel}`;
    if (seen.has(k)) continue;
    seen.add(k);
    values.push({
      userId,
      targetType: target.type,
      eventId: target.type === "event" ? target.id : null,
      taskId: target.type === "task" ? target.id : null,
      specialDateId: target.type === "special_date" ? target.id : null,
      offsetMinutes: d.offsetMinutes,
      channel: d.channel,
    });
  }
  if (!values.length) return [];
  return tx.insert(reminders).values(values).returning();
}
