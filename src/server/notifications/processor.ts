import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { audit } from "../audit/audit.service";
import { db as defaultDb, type Db } from "../db/client";
import { notifications, reminders, specialDates, tasks, userSettings } from "../db/schema";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { localTimeOnDate, toLocalDate } from "../domain/time";
import { ChannelError, type Env, type Transports } from "./channels/types";
import { dispatch } from "./dispatch";
import { buildMessage } from "./messages";
import { listOccurrencesInRange } from "./occurrences";
import { scrubSecrets } from "./scrub";

export const LOOKBACK_MS = 6 * 3_600_000; // disparos más viejos se cancelan
export const LOOKAHEAD_MS = 24 * 3_600_000; // horizonte de materialización
export const STUCK_MS = 10 * 60_000; // 'processing' atascado
export const MAX_ATTEMPTS = 5;
export const BACKOFF_MINUTES = [1, 5, 15, 60]; // tras el intento n (1-based); el 5.º fallo es definitivo
const BATCH = 50;
const MAX_BATCHES = 4;
const CONCURRENCY = 5;

export interface ProcessOptions {
  /** Reloj inyectable (tests). Por defecto la hora actual. */
  now?: Date;
  db?: Db;
  env?: Env;
  transports?: Transports;
}

export interface ProcessSummary {
  materialized: number;
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  cancelled: number;
  durationMs: number;
}

type NewNotification = typeof notifications.$inferInsert;

/**
 * Ejecuta un ciclo completo: materializar → cancelar obsoletas → recuperar atascadas → reclamar → enviar.
 * Idempotente y seguro en paralelo (ON CONFLICT DO NOTHING + FOR UPDATE SKIP LOCKED).
 */
export async function processReminders(opts: ProcessOptions = {}): Promise<ProcessSummary> {
  const started = Date.now();
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const env = opts.env ?? (process.env as Env);
  const transports = opts.transports ?? {};
  const summary: ProcessSummary = { materialized: 0, claimed: 0, sent: 0, failed: 0, retried: 0, cancelled: 0, durationMs: 0 };

  summary.materialized = await materialize(db, now);
  summary.cancelled = await cancelObsolete(db, now);
  summary.retried += await recoverStuck(db, now, summary);

  const settingsCache = new Map<string, { telegramChatId: string | null; notificationEmail: string | null } | null>();
  for (let i = 0; i < MAX_BATCHES; i++) {
    const claimed = await claim(db, now);
    summary.claimed += claimed.length;
    if (claimed.length === 0) break;
    const missing = [...new Set(claimed.map((c) => c.userId))].filter((u) => !settingsCache.has(u));
    if (missing.length) {
      const rows = await db
        .select({ userId: userSettings.userId, telegramChatId: userSettings.telegramChatId, notificationEmail: userSettings.notificationEmail })
        .from(userSettings)
        .where(inArray(userSettings.userId, missing));
      for (const u of missing) settingsCache.set(u, rows.find((r) => r.userId === u) ?? null);
    }
    for (let j = 0; j < claimed.length; j += CONCURRENCY) {
      await Promise.all(
        claimed.slice(j, j + CONCURRENCY).map((n) => deliver(db, n, now, env, transports, settingsCache.get(n.userId) ?? null, summary)),
      );
    }
    if (claimed.length < BATCH) break;
  }

  summary.durationMs = Date.now() - started;
  return summary;
}

// ---------------------------------------------------------------------------------------------
// 1. Materializar
// ---------------------------------------------------------------------------------------------

async function materialize(db: Db, now: Date): Promise<number> {
  const w0 = new Date(now.getTime() - LOOKBACK_MS);
  const w1 = new Date(now.getTime() + LOOKAHEAD_MS);
  const rows: NewNotification[] = [];
  const inWindow = (d: Date) => d >= w0 && d <= w1;

  const active = await db.select().from(reminders).where(eq(reminders.isActive, true));
  if (active.length === 0) return 0;
  const userIds = [...new Set(active.map((r) => r.userId))];
  const settingsRows = await db.select().from(userSettings).where(inArray(userSettings.userId, userIds));
  const settings = new Map(settingsRows.map((s) => [s.userId, s]));
  const tzOf = (u: string) => settings.get(u)?.timezone ?? DEFAULT_TIMEZONE;

  // --- eventos
  const evRem = active.filter((r) => r.targetType === "event" && r.eventId);
  for (const userId of new Set(evRem.map((r) => r.userId))) {
    const mine = evRem.filter((r) => r.userId === userId);
    const maxOff = Math.max(...mine.map((r) => r.offsetMinutes));
    const occs = await listOccurrencesInRange(db, userId, w0, new Date(w1.getTime() + maxOff * 60_000));
    const byEvent = new Map<string, typeof occs>();
    for (const o of occs) byEvent.set(o.eventId, [...(byEvent.get(o.eventId) ?? []), o]);
    for (const r of mine) {
      for (const o of byEvent.get(r.eventId!) ?? []) {
        const trigger = new Date(o.start.getTime() - r.offsetMinutes * 60_000);
        if (!inWindow(trigger)) continue;
        const msg = buildMessage("event", o.title, r.offsetMinutes, o.start, tzOf(userId), { allDay: o.isAllDay, location: o.location });
        rows.push(row(r, o.eventId, o.occurrenceKey, trigger, msg));
      }
    }
  }

  // --- tareas
  const taskRem = active.filter((r) => r.targetType === "task" && r.taskId);
  if (taskRem.length) {
    const ts = await db
      .select()
      .from(tasks)
      .where(
        and(
          inArray(tasks.id, [...new Set(taskRem.map((r) => r.taskId!))]),
          isNull(tasks.deletedAt),
          isNotNull(tasks.dueAt),
          inArray(tasks.status, ["pending", "in_progress"]),
        ),
      );
    const byId = new Map(ts.map((t) => [t.id, t]));
    for (const r of taskRem) {
      const t = byId.get(r.taskId!);
      if (!t || t.userId !== r.userId || !t.dueAt) continue;
      const trigger = new Date(t.dueAt.getTime() - r.offsetMinutes * 60_000);
      if (!inWindow(trigger)) continue;
      rows.push(row(r, t.id, t.dueAt.toISOString(), trigger, buildMessage("task", t.title, r.offsetMinutes, t.dueAt, tzOf(r.userId))));
    }
  }

  // --- fechas especiales (hora de referencia = inicio de la jornada laboral del usuario)
  const sdRem = active.filter((r) => r.targetType === "special_date" && r.specialDateId);
  if (sdRem.length) {
    const sds = await db
      .select()
      .from(specialDates)
      .where(and(inArray(specialDates.id, [...new Set(sdRem.map((r) => r.specialDateId!))]), isNull(specialDates.deletedAt)));
    const byId = new Map(sds.map((s) => [s.id, s]));
    for (const r of sdRem) {
      const sd = byId.get(r.specialDateId!);
      if (!sd || sd.userId !== r.userId) continue;
      const tz = tzOf(r.userId);
      const workStart = settings.get(r.userId)?.workDayStart ?? "08:00";
      const [oy, om, od] = sd.date.split("-").map(Number) as [number, number, number];
      const offMs = r.offsetMinutes * 60_000;
      const y0 = Number(toLocalDate(w0, tz).slice(0, 4));
      const y1 = Number(toLocalDate(new Date(w1.getTime() + offMs), tz).slice(0, 4));
      const years = sd.recursYearly ? range(Math.max(y0, oy), y1) : [oy];
      for (const y of years) {
        let day = od;
        if (sd.recursYearly && om === 2 && od === 29 && !isLeap(y)) day = 28;
        const dateStr = `${String(y).padStart(4, "0")}-${String(om).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const reference = localTimeOnDate(dateStr, workStart, tz);
        const trigger = new Date(reference.getTime() - offMs);
        if (!inWindow(trigger)) continue;
        rows.push(row(r, sd.id, dateStr, trigger, buildMessage("special_date", sd.title, r.offsetMinutes, reference, tz)));
      }
    }
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const res = await db
      .insert(notifications)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing({ target: [notifications.reminderId, notifications.occurrenceKey] })
      .returning({ id: notifications.id });
    inserted += res.length;
  }
  return inserted;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

function row(
  r: typeof reminders.$inferSelect,
  targetId: string,
  occurrenceKey: string,
  trigger: Date,
  msg: { title: string; body: string },
): NewNotification {
  return {
    userId: r.userId,
    reminderId: r.id,
    channel: r.channel,
    targetType: r.targetType,
    targetId,
    occurrenceKey,
    scheduledFor: trigger,
    nextAttemptAt: trigger,
    title: msg.title,
    body: msg.body,
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Cancelar obsoletas
// ---------------------------------------------------------------------------------------------

/**
 * Cancela notificaciones `pending` que ya no deben enviarse: demasiado viejas (> 6 h), recordatorio inactivo
 * o borrado, evento cancelado/borrado/movido/ocurrencia cancelada, tarea completada/cancelada/borrada/con otra
 * fecha límite, fecha especial borrada. Las de prueba (`occurrence_key` 'test:…') no se tocan.
 */
async function cancelObsolete(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - LOOKBACK_MS);
  const res = await db.execute(sql`
    update notifications n set status = 'cancelled', updated_at = ${now},
      last_error = case when n.scheduled_for < ${cutoff} then 'STALE: disparo con más de 6 h de antigüedad' else 'OBSOLETE: el destino o el recordatorio ya no aplica' end
    where n.status = 'pending' and n.occurrence_key not like 'test:%' and (
      n.scheduled_for < ${cutoff}
      or n.reminder_id is null
      or exists (select 1 from reminders r where r.id = n.reminder_id and r.is_active = false)
      or (n.target_type = 'event' and (
        not exists (select 1 from events e where e.id = n.target_id and e.deleted_at is null and e.status <> 'cancelled')
        or exists (select 1 from event_exceptions x where x.event_id = n.target_id and x.occurrence_key = n.occurrence_key
                   and (x.kind = 'cancelled' or x.overrides->>'status' = 'cancelled'))
        or exists (select 1 from events e where e.id = n.target_id
                   and not exists (select 1 from event_recurrence rc where rc.event_id = e.id)
                   and n.occurrence_key <> coalesce(to_char(e.start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), e.start_date::text))
      ))
      or (n.target_type = 'task' and not exists (
        select 1 from tasks t where t.id = n.target_id and t.deleted_at is null and t.status in ('pending','in_progress')
          and t.due_at is not null and n.occurrence_key = to_char(t.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
      or (n.target_type = 'special_date' and not exists (
        select 1 from special_dates s where s.id = n.target_id and s.deleted_at is null))
    )
    returning n.id`);
  return res.rows.length;
}

// ---------------------------------------------------------------------------------------------
// 3. Recuperar atascadas y reclamar
// ---------------------------------------------------------------------------------------------

/** 'processing' sin actividad > 10 min (proceso caído): cuenta como intento fallido y se reintenta o falla. */
async function recoverStuck(db: Db, now: Date, summary: ProcessSummary): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_MS);
  const res = await db.execute<{ status: string }>(sql`
    update notifications set attempts = attempts + 1, updated_at = ${now}, next_attempt_at = ${now},
      status = case when attempts + 1 >= ${MAX_ATTEMPTS} then 'failed'::notification_status else 'pending'::notification_status end,
      last_error = 'STUCK: el procesamiento anterior no terminó'
    where status = 'processing' and updated_at < ${cutoff}
    returning status`);
  const failed = res.rows.filter((r) => r.status === "failed").length;
  summary.failed += failed;
  return res.rows.length - failed;
}

async function claim(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - LOOKBACK_MS);
  const due = db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.status, "pending"),
        lte(notifications.scheduledFor, now),
        lte(notifications.nextAttemptAt, now),
        gte(notifications.scheduledFor, cutoff),
      ),
    )
    .orderBy(notifications.scheduledFor)
    .limit(BATCH)
    .for("update", { skipLocked: true });
  return db
    .update(notifications)
    .set({ status: "processing", updatedAt: now })
    .where(and(inArray(notifications.id, due), eq(notifications.status, "pending")))
    .returning();
}

// ---------------------------------------------------------------------------------------------
// 4. Enviar
// ---------------------------------------------------------------------------------------------

async function deliver(
  db: Db,
  n: typeof notifications.$inferSelect,
  now: Date,
  env: Env,
  transports: Transports,
  settings: { telegramChatId: string | null; notificationEmail: string | null } | null,
  summary: ProcessSummary,
) {
  const secrets = [env.TELEGRAM_BOT_TOKEN, env.RESEND_API_KEY, settings?.telegramChatId];
  try {
    await dispatch(n.channel, { notificationId: n.id, title: n.title, body: n.body }, settings, env, transports);
    await db
      .update(notifications)
      .set({ status: "sent", sentAt: now, attempts: n.attempts + 1, lastError: null, updatedAt: now })
      .where(and(eq(notifications.id, n.id), eq(notifications.status, "processing")));
    summary.sent++;
  } catch (e) {
    const err = e instanceof ChannelError ? e : null;
    const code = err?.code ?? "CHANNEL_TRANSIENT";
    const message = scrubSecrets(`${code}: ${(e as Error)?.message ?? String(e)}`, secrets);
    const attempts = n.attempts + 1;
    const terminal = (err?.permanent ?? false) || attempts >= MAX_ATTEMPTS;
    if (terminal) {
      await db
        .update(notifications)
        .set({ status: "failed", attempts, lastError: message, updatedAt: now })
        .where(and(eq(notifications.id, n.id), eq(notifications.status, "processing")));
      summary.failed++;
      await audit(
        { type: "system", userId: n.userId },
        { action: "notification.failed", resourceType: "notification", resourceId: n.id, result: "failure", changes: { channel: n.channel, attempts, error: message } },
        db,
      );
    } else {
      const backoffMs = (BACKOFF_MINUTES[attempts - 1] ?? 60) * 60_000;
      const waitMs = err?.opts.retryAfterSeconds ? err.opts.retryAfterSeconds * 1000 : backoffMs;
      await db
        .update(notifications)
        .set({ status: "pending", attempts, lastError: message, nextAttemptAt: new Date(now.getTime() + waitMs), updatedAt: now })
        .where(and(eq(notifications.id, n.id), eq(notifications.status, "processing")));
      summary.retried++;
    }
  }
}

