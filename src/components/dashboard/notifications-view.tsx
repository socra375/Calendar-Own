"use client";

import { Bell, BellOff, CheckCheck, Mail, MailOpen, Send } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/layout/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Pager } from "@/components/ui/pager";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonList } from "@/components/ui/panel";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/datetime";
import type { AgendaItem, NotificationDto } from "@/lib/types";
import { errMsg, qs, useApiQuery } from "@/lib/use-api";

const CHANNEL = { internal: { label: "Interno", icon: Bell }, telegram: { label: "Telegram", icon: Send }, email: { label: "Email", icon: Mail } } as const;
const STATUS = {
  pending: { label: "Pendiente", tone: "neutral" },
  processing: { label: "Enviando", tone: "accent" },
  sent: { label: "Enviada", tone: "success" },
  failed: { label: "Fallida", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
} as const;

export function NotificationsView() {
  const app = useApp();
  const toast = useToast();
  const [tab, setTab] = useState("inbox");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const q = useApiQuery<NotificationDto[]>(
    `/api/v1/notifications${qs({ channel: tab === "inbox" ? "internal" : channel || undefined, status: status || undefined, unread: unread || undefined, page, pageSize: 25 })}`,
  );
  const items = q.data ?? [];

  async function mark(n: NotificationDto, read: boolean) {
    try {
      await apiFetch(`/api/v1/notifications/${n.id}`, { method: "PATCH", body: { read } });
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function markAll() {
    setBusy(true);
    try {
      await Promise.all(items.filter((n) => !n.readAt).map((n) => apiFetch(`/api/v1/notifications/${n.id}`, { method: "PATCH", body: { read: true } })));
      toast.success("Marcadas como leídas");
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  function open(n: NotificationDto) {
    if (n.occurrenceKey.startsWith("test:")) return;
    app.openAgendaItem({ type: n.targetType, id: n.targetId, occurrenceKey: n.occurrenceKey } as AgendaItem);
  }
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle="Bandeja interna y estado de las entregas por canal."
        actions={
          <Button variant="outline" onClick={() => void markAll()} loading={busy} disabled={!hasUnread}>
            <CheckCheck className="size-4" aria-hidden /> Marcar todas como leídas
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          label="Vista"
          value={tab}
          onChange={(v) => { setTab(v); setPage(1); }}
          tabs={[{ id: "inbox", label: "Bandeja" }, { id: "deliveries", label: "Entregas (todos los canales)" }]}
        />
        {tab === "deliveries" && (
          <Select aria-label="Canal" className="w-40" value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}>
            <option value="">Todos los canales</option>
            <option value="internal">Interno</option>
            <option value="telegram">Telegram</option>
            <option value="email">Email</option>
          </Select>
        )}
        <Select aria-label="Estado de entrega" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Cualquier estado</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted md:min-h-0">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={unread} onChange={(e) => { setUnread(e.target.checked); setPage(1); }} /> Solo sin leer
        </label>
      </div>

      {q.loading ? (
        <SkeletonList rows={5} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : items.length === 0 ? (
        <EmptyState icon={<BellOff />} title="Sin notificaciones" description="Cuando se dispare un recordatorio aparecerá aquí." />
      ) : (
        <Panel className={cn("p-2 transition-opacity md:p-2", q.fetching && "opacity-60")}>
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const ch = CHANNEL[n.channel];
              const st = STATUS[n.status];
              const isRead = !!n.readAt;
              return (
                <li key={n.id} className={cn("flex items-start gap-3 px-2 py-3", !isRead && "bg-accent/5")}>
                  <span className={cn("mt-1 grid size-8 shrink-0 place-items-center rounded-full border", isRead ? "border-line text-muted" : "border-accent/50 text-accent")}>
                    <ch.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-sm", !isRead ? "font-semibold" : "font-medium")}>{n.title}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Badge>{ch.label}</Badge>
                      {!isRead && <span className="sr-only">Sin leer</span>}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">{n.body}</p>
                    {n.lastError && (
                      <p role="note" className="mt-1.5 rounded-control border border-danger/40 bg-danger/10 px-2.5 py-1.5 font-mono text-xs break-words text-danger">
                        {n.lastError}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      Programada {fmtDateTime(n.scheduledFor, app.tz)}
                      {n.sentAt ? ` · enviada ${fmtDateTime(n.sentAt, app.tz)}` : ""} · {n.attempts} intento{n.attempts === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    {!n.occurrenceKey.startsWith("test:") && (
                      <Button variant="ghost" size="sm" onClick={() => open(n)}>
                        Abrir
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => void mark(n, !isRead)} aria-label={isRead ? "Marcar como no leída" : "Marcar como leída"}>
                      {isRead ? <Mail className="size-4" aria-hidden /> : <MailOpen className="size-4" aria-hidden />}
                      <span className="hidden sm:inline">{isRead ? "No leída" : "Leída"}</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <Pager pagination={q.pagination} onPage={setPage} />
    </div>
  );
}
