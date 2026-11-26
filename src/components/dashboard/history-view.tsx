"use client";

import { ChevronDown, History, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/layout/app-context";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/pickers";
import { Pager } from "@/components/ui/pager";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonList } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/datetime";
import type { AuditDto } from "@/lib/types";
import { qs, useApiQuery } from "@/lib/use-api";

const RESOURCES = ["event", "task", "category", "tag", "special_date", "reminder", "notification", "api_token", "settings", "session"];
const ACTOR_LABEL = { user: "Usuario", eddie: "Eddie", system: "Sistema" } as const;

export function HistoryView() {
  const app = useApp();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [actionQ, setActionQ] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [actorType, setActorType] = useState("");
  const [result, setResult] = useState("");
  const [search, setSearch] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setActionQ(action.trim());
      setSearchQ(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [action, search]);

  const q = useApiQuery<AuditDto[]>(
    `/api/v1/audit-logs${qs({ from: from || undefined, to: to || undefined, action: actionQ, resourceType, actorType, result, q: searchQ, page, pageSize: 30 })}`,
  );
  const items = q.data ?? [];
  const reset = () => setPage(1);

  return (
    <div>
      <PageHeader title="Historial" subtitle="Registro de auditoría de todo lo que cambia (usuario, Eddie y sistema)." />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DatePicker aria-label="Desde" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} />
        <DatePicker aria-label="Hasta" value={to} min={from} onChange={(e) => { setTo(e.target.value); reset(); }} />
        <Input aria-label="Acción (p. ej. event.* o task.create)" placeholder="Acción: event.* / task.create" className="font-mono text-xs" value={action} onChange={(e) => setAction(e.target.value)} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Buscar en el historial" placeholder="Buscar…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Recurso" value={resourceType} onChange={(e) => { setResourceType(e.target.value); reset(); }}>
          <option value="">Todo recurso</option>
          {RESOURCES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
        <Select aria-label="Actor" value={actorType} onChange={(e) => { setActorType(e.target.value); reset(); }}>
          <option value="">Todo actor</option>
          <option value="user">Usuario</option>
          <option value="eddie">Eddie</option>
          <option value="system">Sistema</option>
        </Select>
        <Select aria-label="Resultado" value={result} onChange={(e) => { setResult(e.target.value); reset(); }}>
          <option value="">Cualquier resultado</option>
          <option value="success">Éxito</option>
          <option value="failure">Fallo</option>
        </Select>
      </div>

      {q.loading ? (
        <SkeletonList rows={8} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : items.length === 0 ? (
        <EmptyState icon={<History />} title="Sin registros" description="Ningún registro coincide con los filtros." />
      ) : (
        <Panel className={cn("p-2 transition-opacity md:p-2", q.fetching && "opacity-60")}>
          <ul className="divide-y divide-line">
            {items.map((a) => {
              const isOpen = open === a.id;
              return (
                <li key={a.id}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.id)} className="flex min-h-12 w-full items-center gap-3 rounded-control px-2 py-2.5 text-left transition-colors hover:bg-surface-2/60">
                    <span className="hidden w-36 shrink-0 font-mono text-[11px] text-muted sm:block">{fmtDateTime(a.createdAt, app.tz)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm">{a.action}</span>
                      <span className="block truncate text-xs text-muted sm:hidden">{fmtDateTime(a.createdAt, app.tz)}</span>
                    </span>
                    {a.resourceType && <Badge className="hidden md:inline-flex">{a.resourceType}</Badge>}
                    <Badge tone={a.actorType === "eddie" ? "accent" : a.actorType === "system" ? "warm" : "neutral"}>{ACTOR_LABEL[a.actorType]}</Badge>
                    <Badge tone={a.result === "success" ? "success" : "danger"}>{a.result === "success" ? "OK" : "Fallo"}</Badge>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  {isOpen && (
                    <div className="mx-2 mb-3 space-y-2 rounded-control border border-line bg-surface-2/50 p-3 font-mono text-xs">
                      <p className="text-muted">
                        recurso: {a.resourceType ?? "—"} {a.resourceId ? `· ${a.resourceId}` : ""} · request: {a.requestId ?? "—"} · ip: {a.ip ?? "—"}
                      </p>
                      <pre className="max-h-64 overflow-auto break-words whitespace-pre-wrap">{JSON.stringify(a.changes, null, 2)}</pre>
                    </div>
                  )}
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
