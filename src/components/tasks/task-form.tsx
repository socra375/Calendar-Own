"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DatePicker, TagInput, TimePicker } from "@/components/ui/pickers";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { addDays, localDate, localTime, nowMs, zonedToIso } from "@/lib/datetime";
import type { EventDto, TaskDto } from "@/lib/types";
import { errMsg, qs, useApiQuery } from "@/lib/use-api";
import { taskCreateBody } from "@/lib/validation/tasks";
import { useApp } from "@/components/layout/app-context";

export interface TaskFormRequest {
  task?: TaskDto | null;
  defaults?: { eventId?: string; eventTitle?: string };
}

export function TaskForm({ request, onClose }: { request: TaskFormRequest | null; onClose: () => void }) {
  return (
    <Dialog open={!!request} onClose={onClose} title={request?.task ? "Editar tarea" : "Nueva tarea"} size="md">
      {request && <Inner request={request} onClose={onClose} />}
    </Dialog>
  );
}

function Inner({ request, onClose }: { request: TaskFormRequest; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const t = request.task ?? null;
  const [title, setTitle] = useState(t?.title ?? "");
  const [description, setDescription] = useState(t?.description ?? "");
  const [dueDate, setDueDate] = useState(t?.dueAt ? localDate(t.dueAt, app.tz) : "");
  const [dueTime, setDueTime] = useState(t?.dueAt ? localTime(t.dueAt, app.tz) : "09:00");
  const [priority, setPriority] = useState<TaskDto["priority"]>(t?.priority ?? "medium");
  const [status, setStatus] = useState<TaskDto["status"]>(t?.status ?? "pending");
  const [categoryId, setCategoryId] = useState(t?.categoryId ?? "");
  const [eventId, setEventId] = useState(t?.eventId ?? request.defaults?.eventId ?? "");
  const [tags, setTags] = useState<string[]>(t?.tags.map((x) => x.name) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const today = localDate(nowMs(), app.tz);
    return { from: addDays(today, -7), to: addDays(today, 60) };
  }, [app.tz]);
  const events = useApiQuery<EventDto[]>(`/api/v1/events${qs({ from: range.from, to: range.to, pageSize: 100, sort: "start" })}`);
  const linkedTitle = t?.event?.title ?? request.defaults?.eventTitle;

  async function submit() {
    setError(null);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      dueAt: dueDate ? zonedToIso(dueDate, dueTime || "09:00", app.tz) : null,
      priority,
      status,
      categoryId: categoryId || null,
      eventId: eventId || null,
      tags,
    };
    const parsed = taskCreateBody.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
    setSaving(true);
    try {
      if (t) await apiFetch(`/api/v1/tasks/${t.id}`, { method: "PATCH", body });
      else await apiFetch("/api/v1/tasks", { method: "POST", body });
      toast.success(t ? "Tarea actualizada" : "Tarea creada");
      app.bump();
      onClose();
    } catch (e) {
      setError(errMsg(e));
      setSaving(false);
    }
  }

  const evOptions = events.data ?? [];
  const hasLinked = eventId && !evOptions.some((e) => e.id === eventId);

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Título">{(p) => <Input {...p} autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué hay que hacer?" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vence">{(p) => <DatePicker {...p} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
        <Field label="Hora">{(p) => <TimePicker {...p} value={dueTime} disabled={!dueDate} onChange={(e) => setDueTime(e.target.value)} />}</Field>
        <Field label="Prioridad">
          {(p) => (
            <Select {...p} value={priority} onChange={(e) => setPriority(e.target.value as TaskDto["priority"])}>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </Select>
          )}
        </Field>
        <Field label="Estado">
          {(p) => (
            <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as TaskDto["status"])}>
              <option value="pending">Pendiente</option>
              <option value="in_progress">En progreso</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Categoría">
        {(p) => (
          <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sin categoría</option>
            {app.categories.filter((c) => c.isActive || c.id === categoryId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Evento vinculado" hint="Eventos de los últimos 7 y próximos 60 días.">
        {(p) => (
          <Select {...p} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Sin evento</option>
            {hasLinked && <option value={eventId}>{linkedTitle ?? "Evento vinculado"}</option>}
            {Array.from(new Map(evOptions.map((e) => [e.id, e])).values()).map((e) => (
              <option key={e.id} value={e.id}>
                {e.localDate} · {e.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="space-y-1.5">
        <p className="t-label">Etiquetas</p>
        <TagInput value={tags} onChange={setTags} suggestions={app.tags.map((x) => x.name)} />
      </div>
      <Field label="Descripción">{(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      {error && (
        <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {t ? "Guardar" : "Crear tarea"}
        </Button>
      </div>
    </form>
  );
}
