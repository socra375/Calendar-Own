import "server-only";
import { and, asc, desc, eq, exists, gt, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { EventCreateBody, EventUpdateBody } from "@/lib/validation/events";
import { audit } from "../audit/audit.service";
import { db, type DbOrTx } from "../db/client";
import {
  categories,
  eventExceptions,
  eventRecurrence,
  events,
  eventTags,
  reminders,
  tags,
  type EventOverrides,
} from "../db/schema";
import { blockingConflicts, findConflicts, type ConflictItem } from "../domain/conflicts";
import { addLocalDays, toLocalDate, utcToLocal } from "../domain/time";
import { localTime, MAX_RANGE_DAYS, resolveRange, toIso } from "../domain/format";
import {
  allDaySpanDays,
  buildRrule,
  computeSeriesEnd,
  eventDtstart,
  expandWithMeta,
  floatingFromLocal,
  isValidOccurrenceKey,
  keyToFloating,
  masterOccurrence,
  occurrenceForKey,
  splitRrule,
  summarizeRrule,
  type EventLike,
  type Occurrence,
} from "../domain/recurrence";
import { BlockingConflictError, NotFoundError, ValidationError } from "../http/errors";
import { andAll, countSql, diff, getSettings, like, offsetOf, sourceOf, type ServiceCtx } from "./common";
import { resolveTagIds } from "./tags.service";

type EventRow = typeof events.$inferSelect;
type RecRow = typeof eventRecurrence.$inferSelect;
type ExcRow = typeof eventExceptions.$inferSelect;

export interface Bundle {
  ev: EventRow;
  rec: RecRow | null;
  exc: ExcRow[];
}

const toLike = (ev: EventRow): EventLike => ev as unknown as EventLike;

// ---------- carga auxiliar ----------
async function tagsFor(ids: string[]) {
  const map = new Map<string, { id: string; name: string; color: string | null }[]>();
  if (!ids.length) return map;
  const rows = await db
    .select({ eventId: eventTags.eventId, id: tags.id, name: tags.name, color: tags.color })
    .from(eventTags)
    .innerJoin(tags, eq(tags.id, eventTags.tagId))
    .where(inArray(eventTags.eventId, ids))
    .orderBy(asc(sql`lower(${tags.name})`));
  for (const r of rows) {
    const arr = map.get(r.eventId) ?? [];
    arr.push({ id: r.id, name: r.name, color: r.color });
    map.set(r.eventId, arr);
  }
  return map;
}

async function categoriesFor(ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, { id: string; name: string; color: string }>();
  if (!uniq.length) return map;
  const rows = await db.select({ id: categories.id, name: categories.name, color: categories.color }).from(categories).where(inArray(categories.id, uniq));
  for (const r of rows) map.set(r.id, r);
  return map;
}

async function excFor(ids: string[]) {
  const map = new Map<string, ExcRow[]>();
  if (!ids.length) return map;
  const rows = await db.select().from(eventExceptions).where(inArray(eventExceptions.eventId, ids));
  for (const r of rows) {
    const arr = map.get(r.eventId) ?? [];
    arr.push(r);
    map.set(r.eventId, arr);
  }
  return map;
}

async function assertCategory(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const [c] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId), isNull(categories.deletedAt)))
    .limit(1);
  if (!c) throw new ValidationError("Categoría inexistente", [{ path: "categoryId", code: "invalid_reference", message: "Categoría no encontrada" }]);
}

// ---------- DTOs ----------
export interface DtoMeta {
  tags: { id: string; name: string; color: string | null }[];
  category: { id: string; name: string; color: string } | null;
}

function recurrenceDto(rec: RecRow | null) {
  if (!rec) return null;
  const s = summarizeRrule(rec.rrule);
  return {
    rrule: rec.rrule,
    freq: s.freq,
    interval: s.interval,
    byDay: s.byDay,
    until: s.until,
    count: s.count,
    seriesEndAt: rec.seriesEndAt?.toISOString() ?? null,
  };
}

/** Campos de tiempo explícitos (ISO con offset + partes locales) para un Occurrence o evento maestro. */
export function timeFields(o: Pick<Occurrence, "start" | "end" | "isAllDay" | "startDate" | "endDate" | "timezone">) {
  const tz = o.timezone;
  if (o.isAllDay) {
    const days = Math.max(1, Math.round((floatingFromLocal(o.endDate!).getTime() - floatingFromLocal(o.startDate!).getTime()) / 86_400_000));
    return {
      startAt: null,
      endAt: null,
      startDate: o.startDate,
      endDate: o.endDate,
      localDate: o.startDate!,
      localTime: null,
      endLocalDate: addLocalDays(o.endDate!, -1),
      endLocalTime: null,
      durationMinutes: days * 1440,
    };
  }
  return {
    startAt: toIso(o.start, tz),
    endAt: toIso(o.end, tz),
    startDate: null,
    endDate: null,
    localDate: toLocalDate(o.start, tz),
    localTime: localTime(o.start, tz),
    endLocalDate: toLocalDate(o.end, tz),
    endLocalTime: localTime(o.end, tz),
    durationMinutes: Math.round((o.end.getTime() - o.start.getTime()) / 60_000),
  };
}

function baseDto(o: Occurrence, row: EventRow, rec: RecRow | null, meta: DtoMeta) {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    notes: o.notes,
    isAllDay: o.isAllDay,
    ...timeFields(o),
    timezone: o.timezone,
    categoryId: o.categoryId,
    category: meta.category,
    color: o.color,
    location: o.location,
    meetingUrl: o.meetingUrl,
    meetingProvider: o.meetingProvider,
    status: o.status,
    isBlocking: o.isBlocking,
    source: row.source,
    tags: meta.tags,
    isRecurring: Boolean(rec),
    recurrence: recurrenceDto(rec),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function occurrenceDto(o: Occurrence, row: EventRow, rec: RecRow | null, meta: DtoMeta) {
  return { ...baseDto(o, row, rec, meta), seriesId: o.seriesId, occurrenceKey: o.occurrenceKey, isException: o.isException };
}

export type OccurrenceDto = ReturnType<typeof occurrenceDto>;

export function masterDto(b: Bundle, meta: DtoMeta) {
  return baseDto(masterOccurrence(toLike(b.ev), Boolean(b.rec)), b.ev, b.rec, meta);
}

async function metaMap(rows: EventRow[]) {
  const [t, c] = await Promise.all([tagsFor(rows.map((r) => r.id)), categoriesFor(rows.map((r) => r.categoryId))]);
  return (r: EventRow): DtoMeta => ({ tags: t.get(r.id) ?? [], category: r.categoryId ? (c.get(r.categoryId) ?? null) : null });
}

export async function bundleDtos(bundles: Bundle[]) {
  const mm = await metaMap(bundles.map((b) => b.ev));
  return bundles.map((b) => masterDto(b, mm(b.ev)));
}

export function conflictDto(c: ConflictItem, tz: string) {
  return {
    eventId: c.eventId,
    occurrenceKey: c.occurrenceKey,
    title: c.title,
    start: toIso(c.start, tz),
    end: toIso(c.end, tz),
    localDate: toLocalDate(c.start, tz),
    localStartTime: c.isAllDay ? null : localTime(c.start, tz),
    localEndTime: c.isAllDay ? null : localTime(c.end, tz),
    isBlocking: c.isBlocking,
    isAllDay: c.isAllDay,
  };
}

// ---------- consultas de ocurrencias ----------
export interface OccFilters {
  categoryId?: string;
  tag?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  q?: string;
  excludeId?: string;
}

function textFilter(q: string): SQL {
  const p = like(q);
  return sql`(${events.title} ilike ${p} or ${events.description} ilike ${p} or ${events.location} ilike ${p} or ${events.notes} ilike ${p})`;
}

function tagFilter(userId: string, tag: string): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(eventTags)
      .innerJoin(tags, eq(tags.id, eventTags.tagId))
      .where(and(eq(eventTags.eventId, events.id), eq(tags.userId, userId), sql`lower(${tags.name}) = lower(${tag})`)),
  );
}

export function assertRange(r: { from: Date; to: Date }) {
  if (Number.isNaN(r.from.getTime()) || Number.isNaN(r.to.getTime())) throw new ValidationError("Rango de fechas inválido");
  if (r.to <= r.from) throw new ValidationError("`to` debe ser posterior a `from`");
  if ((r.to.getTime() - r.from.getTime()) / 86_400_000 > MAX_RANGE_DAYS)
    throw new ValidationError(`El rango máximo es de ${MAX_RANGE_DAYS} días`);
}

/** Eventos (con recurrencia/excepciones) que podrían tener ocurrencias en [from,to). */
async function bundlesInRange(userId: string, from: Date, to: Date, f: OccFilters, tz: string): Promise<Bundle[]> {
  const pad = (d: Date, n: number) => addLocalDays(toLocalDate(d, tz), n);
  const fromDate = pad(from, -2);
  const toDate = pad(to, 2);
  const fromPad = new Date(from.getTime() - 2 * 86_400_000);
  const where = andAll([
    eq(events.userId, userId),
    isNull(events.deletedAt),
    f.excludeId ? sql`${events.id} <> ${f.excludeId}` : undefined,
    f.categoryId ? eq(events.categoryId, f.categoryId) : undefined,
    f.tag ? tagFilter(userId, f.tag) : undefined,
    f.q ? textFilter(f.q) : undefined,
    or(
      // únicos
      and(
        isNull(eventRecurrence.eventId),
        or(
          and(eq(events.isAllDay, false), sql`${events.startAt} < ${to}`, or(gt(events.endAt, from), sql`${events.startAt} >= ${from}`)),
          and(eq(events.isAllDay, true), sql`${events.startDate} < ${toDate}::date`, sql`${events.endDate} > ${fromDate}::date`),
        ),
      ),
      // series
      and(
        isNotNull(eventRecurrence.eventId),
        or(isNull(eventRecurrence.seriesEndAt), sql`${eventRecurrence.seriesEndAt} >= ${fromPad}`),
        or(
          and(eq(events.isAllDay, false), sql`${events.startAt} < ${to}`),
          and(eq(events.isAllDay, true), sql`${events.startDate} < ${toDate}::date`),
        ),
      ),
    ),
  ]);
  const rows = await db
    .select({ ev: events, rec: eventRecurrence })
    .from(events)
    .leftJoin(eventRecurrence, eq(eventRecurrence.eventId, events.id))
    .where(where);
  const excMap = await excFor(rows.filter((r) => r.rec).map((r) => r.ev.id));
  return rows.map((r) => ({ ev: r.ev, rec: r.rec, exc: excMap.get(r.ev.id) ?? [] }));
}

export interface OccurrencesResult {
  items: { occ: Occurrence; bundle: Bundle }[];
  truncated: boolean;
}

/** Ocurrencias expandidas (sin borrados, incluye canceladas por estado; las excepciones `cancelled` se omiten). */
export async function fetchOccurrences(userId: string, from: Date, to: Date, f: OccFilters = {}, tzHint?: string): Promise<OccurrencesResult> {
  const tz = tzHint ?? (await getSettings(userId)).timezone;
  const bundles = await bundlesInRange(userId, from, to, f, tz);
  const items: OccurrencesResult["items"] = [];
  let truncated = false;
  for (const b of bundles) {
    const r = expandWithMeta(toLike(b.ev), b.rec, b.exc as never, from, to, b.ev.timezone);
    truncated ||= r.truncated;
    for (const occ of r.occurrences) {
      if (f.status && occ.status !== f.status) continue;
      items.push({ occ, bundle: b });
    }
  }
  items.sort((a, b) => a.occ.start.getTime() - b.occ.start.getTime() || a.occ.title.localeCompare(b.occ.title));
  return { items, truncated };
}

export async function occurrencesToDtos(items: OccurrencesResult["items"]) {
  const mm = await metaMap(items.map((i) => i.bundle.ev));
  return items.map((i) => occurrenceDto(i.occ, i.bundle.ev, i.bundle.rec, mm(i.bundle.ev)));
}

// ---------- listado ----------
export async function listEvents(
  ctx: ServiceCtx,
  q: {
    page: number;
    pageSize: number;
    q?: string;
    categoryId?: string;
    tag?: string;
    status?: "confirmed" | "tentative" | "cancelled";
    from?: string;
    to?: string;
    sort: "start" | "-start" | "title" | "-title" | "created" | "-created";
    deleted?: boolean;
  },
) {
  const userId = ctx.actor.userId;
  const tz = (await getSettings(userId)).timezone;
  if ((q.from && !q.to) || (!q.from && q.to)) throw new ValidationError("`from` y `to` deben enviarse juntos");

  if (q.from && q.to && !q.deleted) {
    const range = resolveRange(q.from, q.to, tz);
    assertRange(range);
    const { items, truncated } = await fetchOccurrences(userId, range.from, range.to, { categoryId: q.categoryId, tag: q.tag, status: q.status, q: q.q }, tz);
    const key = q.sort.replace("-", "");
    const dir = q.sort.startsWith("-") ? -1 : 1;
    const sorted =
      key === "start"
        ? dir === 1 ? items : [...items].reverse()
        : [...items].sort((a, b) =>
            key === "title"
              ? dir * a.occ.title.localeCompare(b.occ.title)
              : dir * (a.bundle.ev.createdAt.getTime() - b.bundle.ev.createdAt.getTime()),
          );
    const page = sorted.slice(offsetOf(q.page, q.pageSize), offsetOf(q.page, q.pageSize) + q.pageSize);
    return { items: await occurrencesToDtos(page), total: sorted.length, meta: { expanded: true, truncated, range: { from: toIso(range.from, tz), to: toIso(range.to, tz), timezone: tz } } };
  }

  const where = andAll([
    eq(events.userId, userId),
    q.deleted ? isNotNull(events.deletedAt) : isNull(events.deletedAt),
    q.categoryId ? eq(events.categoryId, q.categoryId) : undefined,
    q.status ? eq(events.status, q.status) : undefined,
    q.tag ? tagFilter(userId, q.tag) : undefined,
    q.q ? textFilter(q.q) : undefined,
  ]);
  const startExpr = sql`coalesce(${events.startAt}, (${events.startDate})::timestamptz)`;
  const order =
    q.sort === "start" ? [asc(startExpr)] : q.sort === "-start" ? [desc(startExpr)]
    : q.sort === "title" ? [asc(sql`lower(${events.title})`)] : q.sort === "-title" ? [desc(sql`lower(${events.title})`)]
    : q.sort === "created" ? [asc(events.createdAt)] : [desc(events.createdAt)];
  const [{ total } = { total: 0 }] = await db.select({ total: countSql }).from(events).where(where);
  const rows = await db
    .select({ ev: events, rec: eventRecurrence })
    .from(events)
    .leftJoin(eventRecurrence, eq(eventRecurrence.eventId, events.id))
    .where(where)
    .orderBy(...order, asc(events.createdAt), asc(events.id))
    .limit(q.pageSize)
    .offset(offsetOf(q.page, q.pageSize));
  const dtos = await bundleDtos(rows.map((r) => ({ ev: r.ev, rec: r.rec, exc: [] })));
  return { items: dtos, total, meta: { expanded: false } };
}

// ---------- lectura individual ----------
async function loadOwned(userId: string, id: string, opts: { deleted?: boolean } = {}): Promise<Bundle> {
  const [row] = await db
    .select({ ev: events, rec: eventRecurrence })
    .from(events)
    .leftJoin(eventRecurrence, eq(eventRecurrence.eventId, events.id))
    .where(and(eq(events.id, id), eq(events.userId, userId), opts.deleted ? isNotNull(events.deletedAt) : isNull(events.deletedAt)))
    .limit(1);
  if (!row) throw new NotFoundError("Evento no encontrado");
  const exc = row.rec ? (await excFor([id])).get(id) ?? [] : [];
  return { ev: row.ev, rec: row.rec, exc };
}

export async function getEvent(ctx: ServiceCtx, id: string) {
  const b = await loadOwned(ctx.actor.userId, id);
  const [dto] = await bundleDtos([b]);
  return {
    ...dto!,
    exceptions: b.exc.map((e) => ({ occurrenceKey: e.occurrenceKey, kind: e.kind, overrides: e.overrides })),
    reminders: await remindersOf(id),
  };
}

async function remindersOf(eventId: string) {
  const rows = await db.select().from(reminders).where(eq(reminders.eventId, eventId));
  return rows.map((r) => ({ id: r.id, offsetMinutes: r.offsetMinutes, channel: r.channel, isActive: r.isActive }));
}

// ---------- tiempos ----------
interface Times {
  isAllDay: boolean;
  startAt: Date | null;
  endAt: Date | null;
  startDate: string | null;
  endDate: string | null;
}

function timesFromCreate(i: EventCreateBody): Times {
  if (i.isAllDay) {
    const startDate = i.startDate!;
    return { isAllDay: true, startAt: null, endAt: null, startDate, endDate: i.endDate ?? addLocalDays(startDate, 1) };
  }
  const startAt = new Date(i.startAt!);
  const endAt = i.endAt ? new Date(i.endAt) : new Date(startAt.getTime() + (i.durationMinutes ?? 60) * 60_000);
  return { isAllDay: false, startAt, endAt, startDate: null, endDate: null };
}

type TimePatch = Pick<EventUpdateBody, "isAllDay" | "startAt" | "endAt" | "durationMinutes" | "startDate" | "endDate">;

function timesFromPatch(ev: EventLike, p: TimePatch, tz: string): Times {
  const isAllDay = p.isAllDay ?? ev.isAllDay;
  if (isAllDay) {
    const startDate = p.startDate ?? (ev.isAllDay ? ev.startDate! : utcToLocal(ev.startAt!, tz).slice(0, 10));
    const endDate = p.endDate ?? addLocalDays(startDate, ev.isAllDay ? allDaySpanDays(ev) : 1);
    if (endDate <= startDate) throw new ValidationError("endDate (exclusivo) debe ser posterior a startDate");
    return { isAllDay: true, startAt: null, endAt: null, startDate, endDate };
  }
  const prevStart = ev.isAllDay ? null : ev.startAt;
  const startAt = p.startAt ? new Date(p.startAt) : prevStart;
  if (!startAt) throw new ValidationError("startAt es requerido para eventos con hora", [{ path: "startAt", code: "required", message: "Requerido" }]);
  let endAt: Date;
  if (p.endAt) endAt = new Date(p.endAt);
  else if (p.durationMinutes !== undefined) endAt = new Date(startAt.getTime() + p.durationMinutes * 60_000);
  else if (prevStart && !ev.isAllDay) endAt = new Date(startAt.getTime() + (ev.endAt!.getTime() - ev.startAt!.getTime()));
  else endAt = new Date(startAt.getTime() + 60 * 60_000);
  if (endAt < startAt) throw new ValidationError("endAt no puede ser anterior a startAt");
  return { isAllDay: false, startAt, endAt, startDate: null, endDate: null };
}

function rruleFor(spec: NonNullable<EventCreateBody["recurrence"]>, tz: string): string {
  try {
    return buildRrule(spec, tz);
  } catch (e) {
    if (e instanceof RangeError) throw new ValidationError(e.message, [{ path: "recurrence", code: "invalid_rrule", message: e.message }]);
    throw e;
  }
}

// ---------- conflictos ----------
async function checkConflicts(
  userId: string,
  tz: string,
  candidate: EventLike,
  rrule: string | null,
  opts: { ignoreEventId?: string; force?: boolean },
): Promise<ReturnType<typeof conflictDto>[]> {
  if (candidate.status === "cancelled") return [];
  const first = masterOccurrence(candidate, Boolean(rrule), candidate.timezone);
  let occs: Occurrence[] = [first];
  if (rrule) {
    occs = expandWithMeta(candidate, { rrule }, [], first.start, new Date(first.start.getTime() + 90 * 86_400_000), candidate.timezone, 100).occurrences;
  }
  const intervals = occs.filter((o) => !o.isAllDay || o.isBlocking).map((o) => ({ start: o.start, end: o.end }));
  if (!intervals.length) return [];
  const from = new Date(Math.min(...intervals.map((i) => i.start.getTime())));
  const to = new Date(Math.max(...intervals.map((i) => i.end.getTime())));
  if (to <= from) return [];
  const { items } = await fetchOccurrences(userId, from, to, { excludeId: opts.ignoreEventId }, tz);
  const conflicts = findConflicts(intervals, items.map((i) => i.occ), { ignoreEventId: opts.ignoreEventId });
  const dto = conflicts.map((c) => conflictDto(c, tz));
  if (!opts.force && blockingConflicts(conflicts).length)
    throw new BlockingConflictError("El horario choca con un evento bloqueante (usa force:true para forzar)", { conflicts: dto });
  return dto;
}

// ---------- escritura ----------
async function setTags(tx: DbOrTx, userId: string, eventId: string, names: string[]) {
  await tx.delete(eventTags).where(eq(eventTags.eventId, eventId));
  const ids = await resolveTagIds(tx, userId, names);
  if (ids.length) await tx.insert(eventTags).values(ids.map((tagId) => ({ eventId, tagId }))).onConflictDoNothing();
}

export interface WriteResult {
  event: Awaited<ReturnType<typeof getEvent>>;
  conflicts: ReturnType<typeof conflictDto>[];
  /** Solo con scope=this: la ocurrencia resultante. */
  occurrence?: OccurrenceDto;
}

export async function createEvent(ctx: ServiceCtx, input: EventCreateBody): Promise<WriteResult> {
  const userId = ctx.actor.userId;
  const settings = await getSettings(userId);
  const tz = input.timezone ?? settings.timezone;
  await assertCategory(userId, input.categoryId);
  const times = timesFromCreate(input);
  const rrule = input.recurrence ? rruleFor(input.recurrence, tz) : null;

  const candidate = {
    id: "new", title: input.title, description: input.description ?? null, notes: input.notes ?? null, timezone: tz,
    categoryId: input.categoryId ?? null, color: input.color ?? null, location: input.location ?? null,
    meetingUrl: input.meetingUrl ?? null, meetingProvider: input.meetingProvider ?? null, status: input.status, isBlocking: input.isBlocking,
    ...times,
  } satisfies EventLike;
  const conflicts = await checkConflicts(userId, tz, candidate, rrule, { force: input.force });
  const seriesEnd = rrule ? computeSeriesEnd(candidate, rrule, tz) : null;

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(events)
      .values({
        userId, title: input.title, description: input.description ?? null, notes: input.notes ?? null, timezone: tz,
        categoryId: input.categoryId ?? null, color: input.color ?? null, location: input.location ?? null,
        meetingUrl: input.meetingUrl ?? null, meetingProvider: input.meetingProvider ?? null, status: input.status,
        isBlocking: input.isBlocking, source: sourceOf(ctx), ...times,
      })
      .returning({ id: events.id });
    const eventId = row!.id;
    if (rrule) await tx.insert(eventRecurrence).values({ eventId, rrule, seriesEndAt: seriesEnd });
    if (input.tags?.length) await setTags(tx, userId, eventId, input.tags);
    if (input.reminders?.length)
      await tx.insert(reminders).values(input.reminders.map((r) => ({ userId, targetType: "event" as const, eventId, offsetMinutes: r.offsetMinutes, channel: r.channel })));
    return eventId;
  });
  await audit(ctx, {
    action: "event.create", resourceType: "event", resourceId: id,
    changes: { title: input.title, isAllDay: times.isAllDay, start: times.startAt ?? times.startDate, recurrence: rrule, conflicts: conflicts.length },
  });
  return { event: await getEvent(ctx, id), conflicts };
}

type ScopeOpts = { scope: "all" | "this" | "following"; occurrenceKey?: string };

const THIS_ALLOWED = new Set(["title", "description", "notes", "location", "meetingUrl", "color", "status", "startAt", "endAt", "durationMinutes", "startDate", "endDate", "force"]);

function requireKey(b: Bundle, key: string | undefined, tz: string): string {
  if (!key) throw new ValidationError("occurrenceKey es requerido para scope this/following", [{ path: "occurrenceKey", code: "required", message: "Requerido" }]);
  if (!isValidOccurrenceKey(toLike(b.ev), b.rec?.rrule ?? null, key, tz)) throw new NotFoundError("Ocurrencia no encontrada en esta serie");
  return key;
}

const firstKey = (ev: EventRow) => (ev.isAllDay ? ev.startDate! : ev.startAt!.toISOString());

export async function updateEvent(ctx: ServiceCtx, id: string, patch: EventUpdateBody, opts: ScopeOpts): Promise<WriteResult> {
  const userId = ctx.actor.userId;
  const b = await loadOwned(userId, id);
  const tz = b.ev.timezone;
  await assertCategory(userId, patch.categoryId);
  let scope = opts.scope;
  if (!b.rec) scope = "all";
  if (scope === "following" && opts.occurrenceKey && opts.occurrenceKey === firstKey(b.ev)) scope = "all";
  if (scope === "following" && opts.occurrenceKey) requireKey(b, opts.occurrenceKey, tz);

  if (scope === "this") return updateThis(ctx, b, patch, requireKey(b, opts.occurrenceKey, tz));
  if (scope === "following") return updateFollowing(ctx, b, patch, requireKey(b, opts.occurrenceKey, tz));

  // ---- scope all ----
  const { force, tags: tagNames, recurrence, ...rest } = patch;
  const timeTouched = ["isAllDay", "startAt", "endAt", "durationMinutes", "startDate", "endDate"].some((k) => k in patch);
  const times = timeTouched || patch.timezone ? timesFromPatch(toLike(b.ev), rest, patch.timezone ?? tz) : null;
  const newTz = patch.timezone ?? tz;
  const fields = {
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
    ...(patch.color !== undefined && { color: patch.color }),
    ...(patch.location !== undefined && { location: patch.location }),
    ...(patch.meetingUrl !== undefined && { meetingUrl: patch.meetingUrl }),
    ...(patch.meetingProvider !== undefined && { meetingProvider: patch.meetingProvider }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.isBlocking !== undefined && { isBlocking: patch.isBlocking }),
    ...(patch.timezone !== undefined && { timezone: patch.timezone }),
    ...(times ?? {}),
  };
  const merged = { ...b.ev, ...fields } as EventRow;

  let rrule: string | null = b.rec?.rrule ?? null;
  let dropExceptions = false;
  if (recurrence !== undefined) {
    rrule = recurrence ? rruleFor(recurrence, newTz) : null;
    dropExceptions = true;
  }
  if (times && b.rec) {
    const prev = eventDtstart(toLike(b.ev), tz).getTime();
    const next = eventDtstart(toLike(merged), newTz).getTime();
    if (prev !== next || merged.isAllDay !== b.ev.isAllDay) dropExceptions = true;
  }
  const seriesEnd = rrule ? computeSeriesEnd(toLike(merged), rrule, newTz) : null;

  const needsCheck = timeTouched || patch.timezone || patch.status || patch.isBlocking !== undefined || recurrence !== undefined;
  const conflicts = needsCheck ? await checkConflicts(userId, newTz, toLike(merged), rrule, { ignoreEventId: id, force }) : [];

  await db.transaction(async (tx) => {
    if (Object.keys(fields).length) await tx.update(events).set({ ...fields, updatedAt: new Date() }).where(and(eq(events.id, id), eq(events.userId, userId)));
    else await tx.update(events).set({ updatedAt: new Date() }).where(eq(events.id, id));
    if (rrule) {
      await tx.insert(eventRecurrence).values({ eventId: id, rrule, seriesEndAt: seriesEnd }).onConflictDoUpdate({ target: eventRecurrence.eventId, set: { rrule, seriesEndAt: seriesEnd, updatedAt: new Date() } });
    } else if (b.rec) {
      await tx.delete(eventRecurrence).where(eq(eventRecurrence.eventId, id));
    }
    if (dropExceptions) await tx.delete(eventExceptions).where(eq(eventExceptions.eventId, id));
    if (tagNames) await setTags(tx, userId, id, tagNames);
  });
  await audit(ctx, {
    action: "event.update", resourceType: "event", resourceId: id,
    changes: { scope: "all", ...diff(b.ev as never, fields as never), ...(recurrence !== undefined && { recurrence: rrule }), ...(tagNames && { tags: tagNames }), ...(dropExceptions && { exceptionsReset: true }) },
  });
  return { event: await getEvent(ctx, id), conflicts };
}

async function updateThis(ctx: ServiceCtx, b: Bundle, patch: EventUpdateBody, key: string): Promise<WriteResult> {
  const bad = Object.keys(patch).filter((k) => !THIS_ALLOWED.has(k));
  if (bad.length) throw new ValidationError(`Campos no permitidos con scope=this: ${bad.join(", ")}`, bad.map((k) => ({ path: k, code: "not_allowed", message: "Solo scope=all/following" })));
  const userId = ctx.actor.userId;
  const tz = b.ev.timezone;
  const existing = b.exc.find((e) => e.occurrenceKey === key);
  const ov: EventOverrides = { ...(existing?.kind === "modified" ? (existing.overrides ?? {}) : {}) };
  if (patch.title !== undefined) ov.title = patch.title;
  if (patch.description !== undefined) ov.description = patch.description;
  if (patch.notes !== undefined) ov.notes = patch.notes;
  if (patch.location !== undefined) ov.location = patch.location;
  if (patch.meetingUrl !== undefined) ov.meetingUrl = patch.meetingUrl;
  if (patch.color !== undefined) ov.color = patch.color;
  if (patch.status !== undefined) ov.status = patch.status;
  const cur = occurrenceForKey(toLike(b.ev), b.rec, b.exc as never, key, tz);
  if (!cur) throw new NotFoundError("Ocurrencia no encontrada o cancelada");
  if (b.ev.isAllDay) {
    if (patch.startAt || patch.endAt || patch.durationMinutes !== undefined) throw new ValidationError("Evento de día completo: usa startDate/endDate");
    if (patch.startDate) ov.start = patch.startDate;
    if (patch.endDate) ov.end = patch.endDate;
  } else {
    if (patch.startDate || patch.endDate) throw new ValidationError("Evento con hora: usa startAt/endAt");
    const dur = cur.end.getTime() - cur.start.getTime();
    if (patch.startAt) {
      const s = new Date(patch.startAt);
      ov.start = s.toISOString();
      if (!patch.endAt && patch.durationMinutes === undefined) ov.end = new Date(s.getTime() + dur).toISOString();
    }
    if (patch.durationMinutes !== undefined) ov.end = new Date((patch.startAt ? new Date(patch.startAt) : cur.start).getTime() + patch.durationMinutes * 60_000).toISOString();
    if (patch.endAt) ov.end = new Date(patch.endAt).toISOString();
  }
  // Conflictos de la ocurrencia resultante
  const shadow: Bundle = { ...b, exc: [...b.exc.filter((e) => e.occurrenceKey !== key), { occurrenceKey: key, kind: "modified", overrides: ov } as ExcRow] };
  const next = occurrenceForKey(toLike(b.ev), b.rec, shadow.exc as never, key, tz)!;
  let conflicts: ReturnType<typeof conflictDto>[] = [];
  if (next.status !== "cancelled" && ("startAt" in patch || "endAt" in patch || "durationMinutes" in patch || "startDate" in patch || "endDate" in patch || "status" in patch)) {
    const { items } = await fetchOccurrences(userId, next.start, next.end, {}, tz);
    const found = findConflicts(
      next.isAllDay && !next.isBlocking ? [] : [{ start: next.start, end: next.end }],
      items.filter((i) => !(i.occ.id === b.ev.id && i.occ.occurrenceKey === key)).map((i) => i.occ),
    );
    conflicts = found.map((c) => conflictDto(c, tz));
    if (!patch.force && blockingConflicts(found).length) throw new BlockingConflictError("El horario choca con un evento bloqueante (usa force:true para forzar)", { conflicts });
  }
  await db
    .insert(eventExceptions)
    .values({ eventId: b.ev.id, occurrenceKey: key, kind: "modified", overrides: ov })
    .onConflictDoUpdate({ target: [eventExceptions.eventId, eventExceptions.occurrenceKey], set: { kind: "modified", overrides: ov, updatedAt: new Date() } });
  await db.update(events).set({ updatedAt: new Date() }).where(eq(events.id, b.ev.id));
  await audit(ctx, { action: "event.update", resourceType: "event", resourceId: b.ev.id, changes: { scope: "this", occurrenceKey: key, overrides: ov } });
  const [occurrence] = await occurrencesToDtos([{ occ: next, bundle: { ...b, exc: shadow.exc } }]);
  return { event: await getEvent(ctx, b.ev.id), conflicts, occurrence };
}

/** Copia los datos del evento base a una nueva fila. */
function cloneValues(ev: EventRow, ctx: ServiceCtx, over: Partial<typeof events.$inferInsert>): typeof events.$inferInsert {
  return {
    userId: ev.userId, title: ev.title, description: ev.description, notes: ev.notes, isAllDay: ev.isAllDay,
    startAt: ev.startAt, endAt: ev.endAt, startDate: ev.startDate, endDate: ev.endDate, timezone: ev.timezone,
    categoryId: ev.categoryId, color: ev.color, location: ev.location, meetingUrl: ev.meetingUrl,
    meetingProvider: ev.meetingProvider, status: ev.status, isBlocking: ev.isBlocking, source: sourceOf(ctx), ...over,
  };
}

async function copyTagsAndReminders(tx: DbOrTx, fromId: string, toId: string, userId: string) {
  const t = await tx.select({ tagId: eventTags.tagId }).from(eventTags).where(eq(eventTags.eventId, fromId));
  if (t.length) await tx.insert(eventTags).values(t.map((x) => ({ eventId: toId, tagId: x.tagId })));
  const r = await tx.select().from(reminders).where(eq(reminders.eventId, fromId));
  if (r.length)
    await tx.insert(reminders).values(r.map((x) => ({ userId, targetType: "event" as const, eventId: toId, offsetMinutes: x.offsetMinutes, channel: x.channel, isActive: x.isActive })));
}

async function updateFollowing(ctx: ServiceCtx, b: Bundle, patch: EventUpdateBody, key: string): Promise<WriteResult> {
  const userId = ctx.actor.userId;
  const tz = b.ev.timezone;
  const { force, tags: tagNames, recurrence, ...rest } = patch;
  const occ = occurrenceForKey(toLike(b.ev), b.rec, [], key, tz)!;
  // El evento "base" de la nueva serie arranca en la ocurrencia elegida.
  const baseLike: EventLike = b.ev.isAllDay
    ? { ...toLike(b.ev), startDate: occ.startDate, endDate: occ.endDate }
    : { ...toLike(b.ev), startAt: occ.start, endAt: occ.end };
  const times = timesFromPatch(baseLike, rest, patch.timezone ?? tz);
  const newTz = patch.timezone ?? tz;
  const fields = {
    title: patch.title ?? b.ev.title,
    description: patch.description !== undefined ? patch.description : b.ev.description,
    notes: patch.notes !== undefined ? patch.notes : b.ev.notes,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : b.ev.categoryId,
    color: patch.color !== undefined ? patch.color : b.ev.color,
    location: patch.location !== undefined ? patch.location : b.ev.location,
    meetingUrl: patch.meetingUrl !== undefined ? patch.meetingUrl : b.ev.meetingUrl,
    meetingProvider: patch.meetingProvider !== undefined ? patch.meetingProvider : b.ev.meetingProvider,
    status: patch.status ?? b.ev.status,
    isBlocking: patch.isBlocking ?? b.ev.isBlocking,
    timezone: newTz,
    ...times,
  };
  const newLike = { ...toLike(b.ev), ...fields, id: "new" } as EventLike;

  const splitAt = keyToFloating(toLike(b.ev), key, tz)!;
  const { head, tail } = splitRrule(b.rec!.rrule, eventDtstart(toLike(b.ev), tz), splitAt);
  const newRrule = recurrence === undefined ? tail : recurrence ? rruleFor(recurrence, newTz) : null;
  const headSeriesEnd = computeSeriesEnd(toLike(b.ev), head, tz);
  const newSeriesEnd = newRrule ? computeSeriesEnd(newLike, newRrule, newTz) : null;
  const startChanged = eventDtstart(newLike, newTz).getTime() !== splitAt.getTime() || recurrence !== undefined;

  const conflicts = await checkConflicts(userId, newTz, newLike, newRrule, { ignoreEventId: b.ev.id, force });

  const newId = await db.transaction(async (tx) => {
    await tx.update(eventRecurrence).set({ rrule: head, seriesEndAt: headSeriesEnd, updatedAt: new Date() }).where(eq(eventRecurrence.eventId, b.ev.id));
    await tx.update(events).set({ updatedAt: new Date() }).where(eq(events.id, b.ev.id));
    const [row] = await tx.insert(events).values(cloneValues(b.ev, ctx, { ...fields })).returning({ id: events.id });
    const nid = row!.id;
    if (newRrule) await tx.insert(eventRecurrence).values({ eventId: nid, rrule: newRrule, seriesEndAt: newSeriesEnd });
    // Excepciones a partir del corte: se mueven a la nueva serie (o se descartan si cambió el patrón de inicio)
    const later = b.exc.filter((e) => e.occurrenceKey >= key);
    if (later.length) {
      if (startChanged || !newRrule) await tx.delete(eventExceptions).where(and(eq(eventExceptions.eventId, b.ev.id), inArray(eventExceptions.id, later.map((e) => e.id))));
      else await tx.update(eventExceptions).set({ eventId: nid }).where(inArray(eventExceptions.id, later.map((e) => e.id)));
    }
    await copyTagsAndReminders(tx, b.ev.id, nid, userId);
    if (tagNames) await setTags(tx, userId, nid, tagNames);
    return nid;
  });
  await audit(ctx, { action: "event.update", resourceType: "event", resourceId: b.ev.id, changes: { scope: "following", occurrenceKey: key, newEventId: newId, ...diff(b.ev as never, fields as never) } });
  await audit(ctx, { action: "event.create", resourceType: "event", resourceId: newId, changes: { splitFrom: b.ev.id, occurrenceKey: key } });
  return { event: await getEvent(ctx, newId), conflicts };
}

export async function deleteEvent(ctx: ServiceCtx, id: string, opts: ScopeOpts) {
  const userId = ctx.actor.userId;
  const b = await loadOwned(userId, id);
  const tz = b.ev.timezone;
  let scope = opts.scope;
  if (!b.rec) scope = "all";
  if (scope === "following" && opts.occurrenceKey && opts.occurrenceKey === firstKey(b.ev)) scope = "all";

  if (scope === "this") {
    const key = requireKey(b, opts.occurrenceKey, tz);
    await db
      .insert(eventExceptions)
      .values({ eventId: id, occurrenceKey: key, kind: "cancelled", overrides: null })
      .onConflictDoUpdate({ target: [eventExceptions.eventId, eventExceptions.occurrenceKey], set: { kind: "cancelled", overrides: null, updatedAt: new Date() } });
    await audit(ctx, { action: "event.delete", resourceType: "event", resourceId: id, changes: { scope: "this", occurrenceKey: key } });
    return { id, scope, occurrenceKey: key };
  }
  if (scope === "following") {
    const key = requireKey(b, opts.occurrenceKey, tz);
    const { head } = splitRrule(b.rec!.rrule, eventDtstart(toLike(b.ev), tz), keyToFloating(toLike(b.ev), key, tz)!);
    const end = computeSeriesEnd(toLike(b.ev), head, tz);
    await db.transaction(async (tx) => {
      await tx.update(eventRecurrence).set({ rrule: head, seriesEndAt: end, updatedAt: new Date() }).where(eq(eventRecurrence.eventId, id));
      const later = b.exc.filter((e) => e.occurrenceKey >= key).map((e) => e.id);
      if (later.length) await tx.delete(eventExceptions).where(inArray(eventExceptions.id, later));
      await tx.update(events).set({ updatedAt: new Date() }).where(eq(events.id, id));
    });
    await audit(ctx, { action: "event.delete", resourceType: "event", resourceId: id, changes: { scope: "following", occurrenceKey: key } });
    return { id, scope, occurrenceKey: key };
  }
  await db.update(events).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(events.id, id), eq(events.userId, userId)));
  await audit(ctx, { action: "event.delete", resourceType: "event", resourceId: id, changes: { scope: "all", title: b.ev.title } });
  return { id, scope: "all" as const };
}

export async function bulkDeleteEvents(ctx: ServiceCtx, ids: string[]) {
  const userId = ctx.actor.userId;
  const unique = [...new Set(ids)];
  const rows = await db.select({ id: events.id, title: events.title }).from(events).where(and(eq(events.userId, userId), isNull(events.deletedAt), inArray(events.id, unique)));
  const now = new Date();
  if (rows.length) await db.update(events).set({ deletedAt: now, updatedAt: now }).where(inArray(events.id, rows.map((r) => r.id)));
  for (const r of rows) await audit(ctx, { action: "event.delete", resourceType: "event", resourceId: r.id, changes: { scope: "all", bulk: true, title: r.title } });
  const found = new Set(rows.map((r) => r.id));
  return { deleted: rows.length, ids: rows.map((r) => r.id), notFoundIds: unique.filter((i) => !found.has(i)) };
}

export async function restoreEvent(ctx: ServiceCtx, id: string) {
  const userId = ctx.actor.userId;
  await loadOwned(userId, id, { deleted: true });
  await db.update(events).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(events.id, id), eq(events.userId, userId)));
  await audit(ctx, { action: "event.restore", resourceType: "event", resourceId: id });
  return getEvent(ctx, id);
}

export async function duplicateEvent(
  ctx: ServiceCtx,
  id: string,
  input: { title?: string; startAt?: string; endAt?: string; startDate?: string; endDate?: string; force?: boolean },
): Promise<WriteResult> {
  const userId = ctx.actor.userId;
  const b = await loadOwned(userId, id);
  const tz = b.ev.timezone;
  const times = timesFromPatch(toLike(b.ev), input, tz);
  const title = input.title ?? `${b.ev.title} (copia)`;
  const like_ = { ...toLike(b.ev), title, ...times, id: "new" } as EventLike;
  const rrule = b.rec?.rrule ?? null;
  const conflicts = await checkConflicts(userId, tz, like_, rrule, { force: input.force });
  const seriesEnd = rrule ? computeSeriesEnd(like_, rrule, tz) : null;
  const newId = await db.transaction(async (tx) => {
    const [row] = await tx.insert(events).values(cloneValues(b.ev, ctx, { title, ...times })).returning({ id: events.id });
    if (rrule) await tx.insert(eventRecurrence).values({ eventId: row!.id, rrule, seriesEndAt: seriesEnd });
    await copyTagsAndReminders(tx, id, row!.id, userId);
    return row!.id;
  });
  await audit(ctx, { action: "event.duplicate", resourceType: "event", resourceId: newId, changes: { from: id, title } });
  return { event: await getEvent(ctx, newId), conflicts };
}

/** Utilidad para otros services: ¿existe el evento (no borrado) del usuario? */
export async function assertEventOwned(userId: string, id: string) {
  const [r] = await db.select({ id: events.id }).from(events).where(and(eq(events.id, id), eq(events.userId, userId), isNull(events.deletedAt))).limit(1);
  if (!r) throw new ValidationError("Evento inexistente", [{ path: "eventId", code: "invalid_reference", message: "Evento no encontrado" }]);
}
