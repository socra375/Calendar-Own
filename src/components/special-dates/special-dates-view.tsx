"use client";

import { Gift, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/layout/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { DynIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { Pager } from "@/components/ui/pager";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonList } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { fmtDateFull, fmtMonthDay } from "@/lib/datetime";
import type { SpecialDateDto } from "@/lib/types";
import { errMsg, qs, useApiQuery } from "@/lib/use-api";
import { TYPE_LABEL } from "./special-date-form";

export function SpecialDatesView() {
  const app = useApp();
  const toast = useToast();
  const [type, setType] = useState("");
  const [sort, setSort] = useState("next");
  const [search, setSearch] = useState("");
  const [qText, setQText] = useState("");
  const [page, setPage] = useState(1);
  const [del, setDel] = useState<SpecialDateDto | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQText(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const q = useApiQuery<SpecialDateDto[]>(`/api/v1/special-dates${qs({ type, sort, q: qText, page, pageSize: 25 })}`);
  const items = q.data ?? [];

  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/special-dates/${del.id}`, { method: "DELETE" });
      toast.success("Fecha eliminada");
      setDel(null);
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Fechas especiales"
        subtitle="Cumpleaños, festivos y celebraciones, con cuenta atrás."
        actions={
          <Button variant="primary" onClick={() => app.openSpecialDateForm()}>
            <Plus className="size-4" aria-hidden /> Nueva fecha
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Buscar fechas" placeholder="Buscar…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Tipo" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select aria-label="Ordenar" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="next">Próximas primero</option>
          <option value="date">Fecha de origen ↑</option>
          <option value="-date">Fecha de origen ↓</option>
          <option value="title">Título A-Z</option>
        </Select>
      </div>

      {q.loading ? (
        <SkeletonList rows={6} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Gift />} title="No hay fechas especiales" description="Añade cumpleaños o fechas importantes." action={<Button variant="primary" onClick={() => app.openSpecialDateForm()}>Crear fecha</Button>} />
      ) : (
        <Panel className={cn("p-2 transition-opacity md:p-2", q.fetching && "opacity-60")}>
          <ul className="divide-y divide-line">
            {items.map((s) => {
              const c = s.color ?? "var(--accent)";
              return (
                <li key={s.id} className="flex items-center gap-3 px-2 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${c} 18%, transparent)`, color: c }}>
                    <DynIcon name={s.icon} className="size-5" fallback="star" />
                  </span>
                  <button type="button" onClick={() => app.openSpecialDateForm(s)} className="min-h-11 min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium hover:text-accent">{s.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge>{TYPE_LABEL[s.type]}</Badge>
                      <span>{s.recursYearly ? `${fmtMonthDay(s.date)} · anual` : fmtDateFull(s.date)}</span>
                      {typeof s.yearsSince === "number" && s.yearsSince > 0 && <span>· {s.yearsSince} años</span>}
                    </span>
                  </button>
                  <div className="shrink-0 text-right">
                    {s.daysUntil !== null ? (
                      <>
                        <p className={cn("font-mono text-lg leading-none", s.daysUntil <= 7 ? "text-accent" : "text-fg")}>{s.daysUntil === 0 ? "Hoy" : s.daysUntil}</p>
                        <p className="t-label">{s.daysUntil === 0 ? "es hoy" : s.daysUntil === 1 ? "día" : "días"}</p>
                      </>
                    ) : (
                      <Badge>Pasada</Badge>
                    )}
                  </div>
                  <Menu
                    label={`Acciones de «${s.title}»`}
                    triggerClass="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-fg md:size-8"
                    trigger={<MoreHorizontal className="size-4" aria-hidden />}
                    items={[
                      { label: "Editar", icon: <Pencil className="size-4" aria-hidden />, onSelect: () => app.openSpecialDateForm(s) },
                      { label: "Eliminar", icon: <Trash2 className="size-4" aria-hidden />, onSelect: () => setDel(s), danger: true },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <Pager pagination={q.pagination} onPage={setPage} />
      <ConfirmDialog open={!!del} title="¿Eliminar fecha especial?" description={del ? `«${del.title}» se eliminará.` : undefined} confirmLabel="Eliminar" danger loading={busy} onConfirm={() => void remove()} onClose={() => setDel(null)} />
    </div>
  );
}
