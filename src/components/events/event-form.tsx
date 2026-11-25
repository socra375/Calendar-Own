"use client";

import { AlertTriangle, Plus, Trash2, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { ColorPicker, DatePicker, TagInput, TimePicker } from "@/components/ui/pickers";
import { Skeleton } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { addDays, localDate, localTime, minutesLabel, nowMs, wall, zonedToIso } from "@/lib/datetime";
import { PROVIDER_LABEL, detectProvider } from "@/lib/meeting";
import type { ConflictDto, EventDetail, EventDto } from "@/lib/types";
import { errMsg, qs, useApiQuery } from "@/lib/use-api";
import { eventCreateBody } from "@/lib/validation/events";
import { useApp, type EventFormRequest, type Scope } from "@/components/layout/app-context";
import { NO_REC, recFromEvent, recToInput, type RecForm } from "./recurrence";
import { RecurrenceEditor } from "./recurrence-editor";

interface FormState {
  title: string;
  description: string;
  notes: string;
  isAllDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string; // día completo: último día incluido
  endTime: string;
  categoryId: string;
  color: string | null;
  tags: string[];
  location: string;
  meetingUrl: string;
  status: "confirmed" | "tentative" | "cancelled";
  isBlocking: boolean;
  rec: RecForm;
  reminders: { offsetMinutes: number; channel: "internal" | "telegram" | "email" }[];
}

const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];

function fromDto(e: EventDto, rec: RecForm): Omit<FormState, "tags" | "reminders"> {
  return {
    title: e.title,
    description: e.description ?? "",
    notes: e.notes ?? "",
    isAllDay: e.isAllDay,
    startDate: e.localDate,
    startTime: e.localTime ?? "09:00",
    endDate: e.endLocalDate,
    endTime: e.endLocalTime ?? "10:00",
    categoryId: e.categoryId ?? "",
    color: e.color,
    location: e.location ?? "",
    meetingUrl: e.meetingUrl ?? "",
    status: e.status,
    isBlocking: e.isBlocking,
    rec,
  };
}

function nextHour(tz: string) {
  const w = wall(nowMs() + 3600_000, tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: localDate(nowMs() + 3600_000, tz), time: `${p(w.h)}:00`, end: `${p(Math.min(w.h + 1, 23))}:00` };
}

export function EventForm({ request, onClose }: { request: EventFormRequest | null; onClose: () => void }) {
  return (
    <Sheet open={!!request} onClose={onClose} title={request?.eventId ? "Editar evento" : "Nuevo evento"} description={request?.eventId && request.scope && request.scope !== "all" ? (request.scope === "this" ? "Solo esta ocurrencia" : "Esta y las siguientes") : undefined}>
      {request && <FormBody key={`${request.eventId ?? "new"}-${request.scope}-${request.occurrenceKey}`} request={request} onClose={onClose} />}
    </Sheet>
  );
}

function FormBody({ request, onClose }: { request: EventFormRequest; onClose: () => void }) {
  const detailQ = useApiQuery<EventDetail>(request.eventId ? `/api/v1/events/${request.eventId}` : null);
  if (request.eventId && !detailQ.data) {
    return detailQ.error ? (
      <p role="alert" className="text-sm text-danger">
        {detailQ.error.message}
      </p>
    ) : (
      <div className="space-y-3" role="status" aria-label="Cargando evento">
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  return <FormInner request={request} detail={detailQ.data ?? null} onClose={onClose} />;
}

function FormInner({ request, detail, onClose }: { request: EventFormRequest; detail: EventDetail | null; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const scope: Scope = detail ? (request.scope ?? "all") : "all";
  const tz = detail?.timezone ?? app.tz;

  const initial = useMemo<FormState>(() => {
    if (detail) {
      const src = scope === "all" || !request.occurrence ? detail : request.occurrence;
      const base = fromDto(src, recFromEvent(detail));
      return { ...base, tags: detail.tags.map((t) => t.name), reminders: detail.reminders.filter((r) => r.isActive).map((r) => ({ offsetMinutes: r.offsetMinutes, channel: r.channel })) };
    }
    const nh = nextHour(app.tz);
    const d = request.defaults ?? {};
    const startDate = d.startDate ?? nh.date;
    return {
      title: d.title ?? "",
      description: "",
      notes: "",
      isAllDay: d.isAllDay ?? false,
      startDate,
      startTime: d.startTime ?? nh.time,
      endDate: d.endDate ?? (d.isAllDay ? startDate : startDate),
      endTime: d.endTime ?? nh.end,
      categoryId: d.categoryId ?? "",
      color: null,
      tags: [],
      location: "",
      meetingUrl: "",
      status: "confirmed",
      isBlocking: false,
      rec: NO_REC,
      reminders: (app.settings?.defaultReminders ?? []).map((r) => ({ offsetMinutes: r.offsetMinutes, channel: r.channel })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [f, setF] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<ConflictDto[] | null>(null);
  const set = (p: Partial<FormState>) => setF((s) => ({ ...s, ...p }));

  const isThis = scope === "this";
  const provider = detectProvider(f.meetingUrl);

  // Iniciar → mantiene duración
  function changeStart(date: string, time: string) {
    setF((s) => {
      if (s.isAllDay) {
        const span = Math.max(0, (Date.parse(`${s.endDate}T00:00:00Z`) - Date.parse(`${s.startDate}T00:00:00Z`)) / 86_400_000);
        return { ...s, startDate: date, endDate: addDays(date, span) };
      }
      const dur = Date.parse(zonedToIso(s.endDate, s.endTime, tz)) - Date.parse(zonedToIso(s.startDate, s.startTime, tz));
      const ns = Date.parse(zonedToIso(date, time, tz));
      const ne = new Date(ns + (Number.isFinite(dur) ? dur : 3600_000));
      return { ...s, startDate: date, startTime: time, endDate: localDate(ne, tz), endTime: localTime(ne, tz) };
    });
  }

  // ── Conflictos en vivo ──
  const range = useMemo(() => {
    if (f.status === "cancelled") return null;
    try {
      if (f.isAllDay) {
        if (!f.isBlocking) return null;
        return { from: f.startDate, to: f.endDate };
      }
      const a = zonedToIso(f.startDate, f.startTime, tz);
      let b = zonedToIso(f.endDate, f.endTime, tz);
      if (Date.parse(b) <= Date.parse(a)) b = new Date(Date.parse(a) + 60_000).toISOString();
      return { from: a, to: b, fromMs: Date.parse(a), toMs: Date.parse(b) };
    } catch {
      return null;
    }
  }, [f.isAllDay, f.isBlocking, f.startDate, f.startTime, f.endDate, f.endTime, f.status, tz]);
  const rangeKey = range ? `${range.from}|${range.to}` : "";
  const [live, setLive] = useState<{ key: string; items: ConflictDto[] }>({ key: "", items: [] });
  useEffect(() => {
    if (!range || !/^\d{4}-\d{2}-\d{2}/.test(range.from) || (f.isAllDay && range.to < range.from)) return;
    let alive = true;
    const t = window.setTimeout(() => {
      const to = f.isAllDay ? range.to : range.to;
      apiFetch<EventDto[]>(`/api/v1/events${qs({ from: range.from, to: f.isAllDay ? addDays(to, 0) : to, pageSize: 100 })}`)
        .then((r) => {
          if (!alive) return;
          const items: ConflictDto[] = r.data
            .filter((o) => o.id !== request.eventId && o.status !== "cancelled" && (!o.isAllDay || o.isBlocking))
            .filter((o) => {
              if (o.isAllDay || f.isAllDay) return true;
              return Date.parse(o.startAt!) < range.toMs! && Date.parse(o.endAt!) > range.fromMs!;
            })
            .map((o) => ({
              eventId: o.id,
              occurrenceKey: o.occurrenceKey ?? "",
              title: o.title,
              start: o.startAt ?? o.startDate ?? "",
              end: o.endAt ?? o.endDate ?? "",
              localDate: o.localDate,
              localStartTime: o.localTime,
              localEndTime: o.endLocalTime,
              isBlocking: o.isBlocking,
              isAllDay: o.isAllDay,
            }));
          setLive({ key: rangeKey, items });
        })
        .catch(() => alive && setLive({ key: rangeKey, items: [] }));
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, request.eventId]);
  const liveConflicts = live.key === rangeKey ? live.items : [];

  // ── Construcción del cuerpo ──
  function timeFields() {
    return f.isAllDay
      ? { isAllDay: true as const, startDate: f.startDate, endDate: addDays(f.endDate < f.startDate ? f.startDate : f.endDate, 1) }
      : { isAllDay: false as const, startAt: zonedToIso(f.startDate, f.startTime, tz), endAt: zonedToIso(f.endDate, f.endTime, tz) };
  }

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  async function submit(force: boolean) {
    setError(null);
    if (!f.title.trim()) return setError("El título es obligatorio");
    if (!f.isAllDay && Date.parse(zonedToIso(f.endDate, f.endTime, tz)) < Date.parse(zonedToIso(f.startDate, f.startTime, tz))) return setError("El fin no puede ser anterior al inicio");
    if (f.isAllDay && f.endDate < f.startDate) return setError("El último día no puede ser anterior al primero");
    const startDow = wall(zonedToIso(f.startDate, f.startTime || "09:00", tz), tz).dow;
    let recInput;
    try {
      recInput = recToInput(f.rec, startDow);
    } catch {
      recInput = null;
    }
    if (f.rec.freq === "custom" && !f.rec.rrule.trim()) return setError("Escribe la regla RRULE de la repetición personalizada");
    if (f.rec.end === "until" && f.rec.freq !== "none" && !f.rec.until) return setError("Indica la fecha de fin de la repetición");

    setSaving(true);
    try {
      if (!detail) {
        const body = {
          title: f.title.trim(),
          description: f.description.trim() || null,
          notes: f.notes.trim() || null,
          ...timeFields(),
          timezone: tz,
          categoryId: f.categoryId || null,
          color: f.color,
          location: f.location.trim() || null,
          meetingUrl: f.meetingUrl.trim() || null,
          meetingProvider: provider,
          status: f.status,
          isBlocking: f.isBlocking,
          tags: f.tags,
          recurrence: recInput,
          reminders: f.reminders,
          force,
        };
        const parsed = eventCreateBody.safeParse(body);
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos");
        const r = await apiFetch<EventDetail>("/api/v1/events", { method: "POST", body });
        const n = (r.meta.conflicts as unknown[] | undefined)?.length ?? 0;
        toast.success(n ? `Evento creado con ${n} conflicto${n > 1 ? "s" : ""} de horario` : "Evento creado");
      } else {
        const patch: Record<string, unknown> = {};
        const d = initial;
        if (f.title.trim() !== d.title) patch.title = f.title.trim();
        if (f.description !== d.description) patch.description = f.description.trim() || null;
        if (f.notes !== d.notes) patch.notes = f.notes.trim() || null;
        if (f.location !== d.location) patch.location = f.location.trim() || null;
        if (f.meetingUrl !== d.meetingUrl) {
          patch.meetingUrl = f.meetingUrl.trim() || null;
          if (!isThis) patch.meetingProvider = provider;
        }
        if (f.color !== d.color) patch.color = f.color;
        if (f.status !== d.status) patch.status = f.status;
        if (!isThis) {
          if (f.categoryId !== d.categoryId) patch.categoryId = f.categoryId || null;
          if (f.isBlocking !== d.isBlocking) patch.isBlocking = f.isBlocking;
          if (!same(f.tags, d.tags)) patch.tags = f.tags;
          if (!same(f.rec, d.rec)) patch.recurrence = recInput;
        }
        const timeChanged = f.isAllDay !== d.isAllDay || f.startDate !== d.startDate || f.endDate !== d.endDate || (!f.isAllDay && (f.startTime !== d.startTime || f.endTime !== d.endTime));
        if (timeChanged) Object.assign(patch, timeFields());
        const remChanged = scope === "all" && !same(f.reminders, d.reminders);
        if (!Object.keys(patch).length && !remChanged) {
          toast.info("No hay cambios que guardar");
          onClose();
          return;
        }
        let eventId = detail.id;
        if (Object.keys(patch).length) {
          const r = await apiFetch<EventDetail>(
            `/api/v1/events/${detail.id}${qs({ scope, occurrenceKey: scope === "all" ? undefined : request.occurrenceKey })}`,
            { method: "PATCH", body: { ...patch, force } },
          );
          eventId = r.data.id;
          const n = (r.meta.conflicts as unknown[] | undefined)?.length ?? 0;
          if (n) toast.info(`Guardado, pero hay ${n} conflicto${n > 1 ? "s" : ""} de horario`);
        }
        if (remChanged) {
          const cur = detail.reminders;
          const keep = new Set<number>();
          const toDelete = cur.filter((r) => {
            const idx = f.reminders.findIndex((x, i) => !keep.has(i) && x.offsetMinutes === r.offsetMinutes && x.channel === r.channel);
            if (idx >= 0 && r.isActive) {
              keep.add(idx);
              return false;
            }
            return true;
          });
          await Promise.all(toDelete.map((r) => apiFetch(`/api/v1/reminders/${r.id}`, { method: "DELETE" })));
          await Promise.all(
            f.reminders
              .filter((_, i) => !keep.has(i))
              .map((r) => apiFetch("/api/v1/reminders", { method: "POST", body: { targetType: "event", targetId: eventId, offsetMinutes: r.offsetMinutes, channel: r.channel } })),
          );
        }
        toast.success("Evento actualizado");
      }
      app.bump();
      onClose();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "BLOCKING_CONFLICT") {
        setBlocking(((e.details as { conflicts?: ConflictDto[] } | undefined)?.conflicts) ?? []);
      } else {
        setError(errMsg(e));
      }
    } finally {
      setSaving(false);
    }
  }

  const unscopedDisabled = isThis;
  return (
    <form
      id="event-form"
      className="space-y-5 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      noValidate
    >
      <Field label="Título" error={error && !f.title.trim() ? error : null}>
        {(p) => <Input {...p} autoFocus value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Reunión, clase, cita…" maxLength={200} required />}
      </Field>

      <fieldset className="space-y-3 rounded-card border border-line p-3">
        <legend className="t-label px-1">Cuándo</legend>
        <Switch checked={f.isAllDay} onChange={(v) => set({ isAllDay: v })} label="Todo el día" />
        <div className="grid grid-cols-2 gap-3">
          <Field label={f.isAllDay ? "Primer día" : "Inicio"}>
            {(p) => <DatePicker {...p} value={f.startDate} onChange={(e) => e.target.value && changeStart(e.target.value, f.startTime)} required />}
          </Field>
          {!f.isAllDay && <Field label="Hora de inicio">{(p) => <TimePicker {...p} value={f.startTime} onChange={(e) => e.target.value && changeStart(f.startDate, e.target.value)} required />}</Field>}
          <Field label={f.isAllDay ? "Último día" : "Fin"}>{(p) => <DatePicker {...p} value={f.endDate} min={f.startDate} onChange={(e) => set({ endDate: e.target.value })} required />}</Field>
          {!f.isAllDay && <Field label="Hora de fin">{(p) => <TimePicker {...p} value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} required />}</Field>}
        </div>
        <p className="font-mono text-[11px] text-muted">Zona horaria: {tz}</p>

        {(liveConflicts.length > 0 || blocking) && (
          <div role="status" aria-live="polite" className="space-y-1.5 rounded-control border border-warm/50 bg-warm/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-warm">
              <AlertTriangle className="size-4" aria-hidden />
              {(blocking?.length ?? liveConflicts.length)} conflicto{(blocking?.length ?? liveConflicts.length) > 1 ? "s" : ""} de horario
            </p>
            <ul className="space-y-1">
              {(blocking ?? liveConflicts).slice(0, 6).map((c) => (
                <li key={`${c.eventId}-${c.occurrenceKey}`} className="flex flex-wrap items-center gap-2 text-fg">
                  <span className="font-medium">{c.title}</span>
                  <span className="font-mono text-xs text-muted">
                    {c.localDate}
                    {c.localStartTime ? ` · ${c.localStartTime}–${c.localEndTime}` : " · todo el día"}
                  </span>
                  {c.isBlocking && <Badge tone="danger">bloqueante</Badge>}
                </li>
              ))}
            </ul>
            {blocking && (
              <div className="pt-1">
                <p className="mb-2 text-xs text-muted">Choca con un evento bloqueante: el servidor no lo guarda salvo que lo fuerces.</p>
                <Button variant="danger" size="sm" loading={saving} onClick={() => void submit(true)}>
                  Guardar de todos modos
                </Button>
              </div>
            )}
          </div>
        )}
      </fieldset>

      {!unscopedDisabled && <RecurrenceEditor value={f.rec} onChange={(rec) => set({ rec })} />}

      {!unscopedDisabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría">
            {(p) => (
              <Select {...p} value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                <option value="">Sin categoría</option>
                {app.categories.filter((c) => c.isActive || c.id === f.categoryId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Estado">
            {(p) => (
              <Select {...p} value={f.status} onChange={(e) => set({ status: e.target.value as FormState["status"] })}>
                <option value="confirmed">Confirmado</option>
                <option value="tentative">Tentativo</option>
                <option value="cancelled">Cancelado</option>
              </Select>
            )}
          </Field>
        </div>
      )}
      {unscopedDisabled && (
        <Field label="Estado">
          {(p) => (
            <Select {...p} value={f.status} onChange={(e) => set({ status: e.target.value as FormState["status"] })}>
              <option value="confirmed">Confirmado</option>
              <option value="tentative">Tentativo</option>
              <option value="cancelled">Cancelado</option>
            </Select>
          )}
        </Field>
      )}

      <div className="space-y-1.5">
        <p className="t-label">Color (opcional, por defecto el de la categoría)</p>
        <ColorPicker value={f.color} onChange={(c) => set({ color: c })} allowNone />
      </div>

      {!unscopedDisabled && <Switch checked={f.isBlocking} onChange={(v) => set({ isBlocking: v })} label="Bloqueo obligatorio" description="Impide solapar otros eventos (los conflictos exigirán confirmación)." />}

      <Field label="Ubicación">{(p) => <Input {...p} value={f.location} onChange={(e) => set({ location: e.target.value })} maxLength={500} placeholder="Lugar o dirección" />}</Field>

      <Field label="URL de videollamada" hint={f.meetingUrl && !provider ? "URL no válida" : undefined} error={f.meetingUrl && !provider ? "URL no válida (incluye https://)" : null}>
        {(p) => <Input {...p} type="url" inputMode="url" value={f.meetingUrl} onChange={(e) => set({ meetingUrl: e.target.value })} placeholder="https://meet.google.com/…" />}
      </Field>
      {provider && (
        <p className="-mt-3 flex items-center gap-2 text-xs text-muted">
          <Video className="size-3.5 text-accent" aria-hidden /> Proveedor detectado: <Badge tone="accent">{PROVIDER_LABEL[provider]}</Badge>
        </p>
      )}

      {!unscopedDisabled && (
        <div className="space-y-1.5">
          <p className="t-label">Etiquetas</p>
          <TagInput value={f.tags} onChange={(tags) => set({ tags })} suggestions={app.tags.map((t) => t.name)} />
        </div>
      )}

      <Field label="Descripción">{(p) => <Textarea {...p} value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={10000} />}</Field>
      <Field label="Notas privadas">{(p) => <Textarea {...p} value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={10000} />}</Field>

      {(scope === "all") && (
        <fieldset className="space-y-3 rounded-card border border-line p-3">
          <legend className="t-label px-1">Recordatorios</legend>
          {f.reminders.length === 0 && <p className="text-sm text-muted">Sin recordatorios.</p>}
          <ul className="space-y-2">
            {f.reminders.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <Select aria-label="Cuándo avisar" value={REMINDER_PRESETS.includes(r.offsetMinutes) ? r.offsetMinutes : "custom"} onChange={(e) => setF((s) => ({ ...s, reminders: s.reminders.map((x, j) => (j === i ? { ...x, offsetMinutes: Number(e.target.value) } : x)) }))}>
                  {REMINDER_PRESETS.map((m) => (
                    <option key={m} value={m}>
                      {minutesLabel(m)}
                    </option>
                  ))}
                  {!REMINDER_PRESETS.includes(r.offsetMinutes) && <option value="custom">{minutesLabel(r.offsetMinutes)}</option>}
                </Select>
                <Select aria-label="Canal" className="max-w-32" value={r.channel} onChange={(e) => setF((s) => ({ ...s, reminders: s.reminders.map((x, j) => (j === i ? { ...x, channel: e.target.value as FormState["reminders"][number]["channel"] } : x)) }))}>
                  <option value="internal">Interno</option>
                  <option value="telegram">Telegram</option>
                  <option value="email">Email</option>
                </Select>
                <Button variant="ghost" size="icon" aria-label="Quitar recordatorio" onClick={() => setF((s) => ({ ...s, reminders: s.reminders.filter((_, j) => j !== i) }))}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" onClick={() => setF((s) => ({ ...s, reminders: [...s.reminders, { offsetMinutes: 15, channel: "internal" }] }))}>
            <Plus className="size-3.5" aria-hidden /> Añadir recordatorio
          </Button>
        </fieldset>
      )}

      {error && f.title.trim() && (
        <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="sticky -bottom-4 -mx-5 flex justify-end gap-2 border-t border-line bg-surface px-5 py-3">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={saving && !blocking}>
          {detail ? "Guardar cambios" : "Crear evento"}
        </Button>
      </div>
    </form>
  );
}
