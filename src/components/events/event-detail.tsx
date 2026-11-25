"use client";

import { Bell, Calendar, CheckSquare, Clock, Copy, ExternalLink, MapPin, Pencil, Repeat, Trash2, Video } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { fmtDateLong, fmtDuration, minutesLabel } from "@/lib/datetime";
import { PROVIDER_LABEL } from "@/lib/meeting";
import type { ConflictDto, EventDetail, EventDto } from "@/lib/types";
import { errMsg, qs, useApiQuery } from "@/lib/use-api";
import { useApp, type Scope } from "@/components/layout/app-context";
import { describeRec, recFromEvent } from "./recurrence";
import { ScopeDialog } from "./scope-dialog";

export interface DetailTarget {
  id: string;
  occurrence?: EventDto;
  /** Ocurrencia a resolver (desde la agenda/dashboard): clave y día local. */
  hint?: { occurrenceKey: string | null; localDate: string };
}

export function EventDetailDialog({ target, onClose }: { target: DetailTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onClose={onClose} title="Detalle del evento" size="md">
      {target && <Resolve key={target.id + (target.occurrence?.occurrenceKey ?? target.hint?.occurrenceKey ?? "")} target={target} onClose={onClose} />}
    </Dialog>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 text-muted [&>svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Si solo hay una pista de ocurrencia, la busca en el día local para mostrar la hora correcta. */
function Resolve({ target, onClose }: { target: DetailTarget; onClose: () => void }) {
  const h = target.hint;
  const q = useApiQuery<EventDto[]>(!target.occurrence && h?.occurrenceKey ? `/api/v1/events${qs({ from: h.localDate, to: h.localDate, pageSize: 100 })}` : null);
  if (!target.occurrence && h?.occurrenceKey && !q.data && !q.error) {
    return <Skeleton className="h-24" />;
  }
  const occurrence = target.occurrence ?? q.data?.find((o) => o.id === target.id && o.occurrenceKey === h?.occurrenceKey);
  return <Body target={{ id: target.id, occurrence }} onClose={onClose} />;
}

function Body({ target, onClose }: { target: { id: string; occurrence?: EventDto }; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const q = useApiQuery<EventDetail>(`/api/v1/events/${target.id}`);
  const [askEdit, setAskEdit] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dupConflict, setDupConflict] = useState<{ title: string; conflicts: ConflictDto[] } | null>(null);

  if (!q.data) {
    return q.error ? (
      <p role="alert" className="text-sm text-danger">
        {q.error.message}
      </p>
    ) : (
      <div className="space-y-3" role="status" aria-label="Cargando">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  const master = q.data;
  const e: EventDto = target.occurrence ?? master;
  const recurring = master.isRecurring;
  const occKey = target.occurrence?.occurrenceKey;
  const color = e.color ?? e.category?.color ?? null;

  function edit(scope: Scope) {
    setAskEdit(false);
    onClose();
    app.openEventForm({ eventId: master.id, occurrence: target.occurrence, scope, occurrenceKey: occKey });
  }

  async function remove(scope: Scope) {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/events/${master.id}${qs({ scope: recurring ? scope : "all", occurrenceKey: recurring && scope !== "all" ? occKey : undefined })}`, { method: "DELETE" });
      toast.success(recurring && scope !== "all" ? (scope === "this" ? "Ocurrencia eliminada" : "Ocurrencias eliminadas") : "Evento eliminado");
      app.bump();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
      setBusy(false);
    }
  }

  async function duplicate(force = false) {
    setBusy(true);
    try {
      const r = await apiFetch<EventDetail>(`/api/v1/events/${master.id}/duplicate`, { method: "POST", body: { force } });
      toast.success("Evento duplicado. Ajusta la fecha si hace falta.");
      app.bump();
      onClose();
      app.openEventForm({ eventId: r.data.id, scope: "all" });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "BLOCKING_CONFLICT") {
        setDupConflict({ title: master.title, conflicts: ((err.details as { conflicts?: ConflictDto[] })?.conflicts) ?? [] });
      } else toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {color && <span aria-hidden className="size-3 rounded-full" style={{ background: color }} />}
        <h3 className="text-lg font-semibold">{e.title}</h3>
        {e.status !== "confirmed" && <Badge tone={e.status === "cancelled" ? "danger" : "warm"}>{e.status === "cancelled" ? "Cancelado" : "Tentativo"}</Badge>}
        {e.isBlocking && <Badge tone="danger">Bloqueante</Badge>}
        {target.occurrence?.isException && <Badge>Modificada</Badge>}
        {recurring && <Badge tone="accent">Serie</Badge>}
      </div>

      <div className="space-y-3">
        <Row icon={<Clock />}>
          <p className="font-medium capitalize">{fmtDateLong(e.localDate)}{e.endLocalDate !== e.localDate && ` → ${fmtDateLong(e.endLocalDate)}`}</p>
          <p className="font-mono text-xs text-muted">
            {e.isAllDay ? "Todo el día" : `${e.localTime}–${e.endLocalTime} · ${fmtDuration(e.durationMinutes)}`} · {e.timezone}
          </p>
        </Row>
        {recurring && (
          <Row icon={<Repeat />}>
            <p>{describeRec(recFromEvent(master))}</p>
          </Row>
        )}
        {e.category && (
          <Row icon={<Calendar />}>
            <Badge color={e.category.color}>{e.category.name}</Badge>
          </Row>
        )}
        {e.location && (
          <Row icon={<MapPin />}>
            <p className="break-words">{e.location}</p>
          </Row>
        )}
        {e.meetingUrl && (
          <Row icon={<Video />}>
            <a href={e.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-accent underline-offset-2 hover:underline">
              Unirse{e.meetingProvider ? ` · ${PROVIDER_LABEL[e.meetingProvider]}` : ""} <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Row>
        )}
        {master.reminders.length > 0 && (
          <Row icon={<Bell />}>
            <p>{master.reminders.map((r) => `${minutesLabel(r.offsetMinutes)} (${r.channel})`).join(" · ")}</p>
          </Row>
        )}
      </div>
      {e.description && <p className="whitespace-pre-wrap break-words text-sm">{e.description}</p>}
      {e.notes && (
        <div className="rounded-control border border-line bg-surface-2/50 p-3">
          <p className="t-label mb-1">Notas</p>
          <p className="whitespace-pre-wrap break-words text-sm">{e.notes}</p>
        </div>
      )}
      {master.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {master.tags.map((t) => (
            <Badge key={t.id} tone="accent">
              {t.name}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="primary" onClick={() => (recurring ? setAskEdit(true) : edit("all"))}>
          <Pencil className="size-4" aria-hidden /> Editar
        </Button>
        <Button variant="outline" onClick={() => void duplicate()} loading={busy}>
          <Copy className="size-4" aria-hidden /> Duplicar
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            onClose();
            app.openTaskForm(null, { eventId: master.id, eventTitle: master.title });
          }}
        >
          <CheckSquare className="size-4" aria-hidden /> Crear tarea
        </Button>
        <Button variant="ghost" className="ml-auto text-danger hover:text-danger" onClick={() => setAskDelete(true)}>
          <Trash2 className="size-4" aria-hidden /> Eliminar
        </Button>
      </div>

      {recurring ? (
        <>
          <ScopeDialog open={askEdit} title="Editar evento recurrente" description="¿Qué ocurrencias quieres modificar?" confirmLabel="Continuar" onConfirm={edit} onClose={() => setAskEdit(false)} />
          <ScopeDialog open={askDelete} title="Eliminar evento recurrente" description="¿Qué ocurrencias quieres eliminar?" confirmLabel="Eliminar" danger loading={busy} onConfirm={(s) => void remove(s)} onClose={() => setAskDelete(false)} />
        </>
      ) : (
        <ConfirmDialog open={askDelete} title="¿Eliminar este evento?" description={`«${master.title}» se moverá a la papelera.`} confirmLabel="Eliminar" danger loading={busy} onConfirm={() => void remove("all")} onClose={() => setAskDelete(false)} />
      )}
      <ConfirmDialog
        open={!!dupConflict}
        title="Conflicto bloqueante"
        description="La copia coincide en horario con un evento bloqueante. ¿Duplicar de todos modos?"
        confirmLabel="Duplicar igualmente"
        danger
        loading={busy}
        onConfirm={() => {
          setDupConflict(null);
          void duplicate(true);
        }}
        onClose={() => setDupConflict(null)}
      >
        <ul className="space-y-1 text-sm">
          {dupConflict?.conflicts.map((c) => (
            <li key={c.eventId + c.occurrenceKey}>{c.title}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}
