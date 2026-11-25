"use client";

import { CalendarDays, Check, CheckSquare, MoreHorizontal, Pencil, Plus, Search, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/layout/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Menu } from "@/components/ui/menu";
import { Pager } from "@/components/ui/pager";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonList } from "@/components/ui/panel";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { fmtDateShort } from "@/lib/datetime";
import type { TaskDto } from "@/lib/types";
import { errMsg, qs, useApiQuery } from "@/lib/use-api";

const TABS = [
  { id: "open", label: "Abiertas" },
  { id: "completed", label: "Completadas" },
  { id: "cancelled", label: "Canceladas" },
  { id: "all", label: "Todas" },
];
const STATUS_QS: Record<string, string | undefined> = { open: "pending,in_progress", completed: "completed", cancelled: "cancelled", all: undefined };
const PRIORITY = { urgent: { label: "Urgente", tone: "danger" }, high: { label: "Alta", tone: "warm" }, medium: { label: "Media", tone: "neutral" }, low: { label: "Baja", tone: "neutral" } } as const;
const STATUS_LABEL = { pending: "Pendiente", in_progress: "En progreso", completed: "Completada", cancelled: "Cancelada" } as const;

export function TasksView() {
  const app = useApp();
  const toast = useToast();
  const [tab, setTab] = useState("open");
  const [priority, setPriority] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tag, setTag] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [sort, setSort] = useState("due");
  const [search, setSearch] = useState("");
  const [qText, setQText] = useState("");
  const [page, setPage] = useState(1);
  const [del, setDel] = useState<TaskDto | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQText(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const q = useApiQuery<TaskDto[]>(`/api/v1/tasks${qs({ status: STATUS_QS[tab], priority: priority || undefined, categoryId, tag, overdue: overdue || undefined, sort, q: qText, page, pageSize: 25 })}`);
  const tasks = q.data ?? [];

  async function patch(t: TaskDto, status: TaskDto["status"], msg: string) {
    try {
      await apiFetch(`/api/v1/tasks/${t.id}`, { method: "PATCH", body: { status } });
      toast.success(msg);
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tasks/${del.id}`, { method: "DELETE" });
      toast.success("Tarea eliminada");
      setDel(null);
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const reset = () => setPage(1);

  return (
    <div>
      <PageHeader
        title="Tareas"
        subtitle="Pendientes, prioridades y vencimientos."
        actions={
          <Button variant="primary" onClick={() => app.openTaskForm()}>
            <Plus className="size-4" aria-hidden /> Nueva tarea
          </Button>
        }
      />
      <div className="mb-4 space-y-3">
        <Tabs tabs={TABS} value={tab} onChange={(v) => { setTab(v); reset(); }} label="Estado de las tareas" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" aria-label="Buscar tareas" placeholder="Buscar…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Prioridad" value={priority} onChange={(e) => { setPriority(e.target.value); reset(); }}>
            <option value="">Toda prioridad</option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </Select>
          <Select aria-label="Categoría" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); reset(); }}>
            <option value="">Toda categoría</option>
            {app.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select aria-label="Etiqueta" value={tag} onChange={(e) => { setTag(e.target.value); reset(); }}>
            <option value="">Toda etiqueta</option>
            {app.tags.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </Select>
          <Select aria-label="Ordenar por" value={sort} onChange={(e) => { setSort(e.target.value); reset(); }}>
            <option value="due">Vencimiento ↑</option>
            <option value="-due">Vencimiento ↓</option>
            <option value="-priority">Prioridad ↓</option>
            <option value="priority">Prioridad ↑</option>
            <option value="-created">Más recientes</option>
            <option value="title">Título A-Z</option>
          </Select>
        </div>
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm text-muted md:min-h-0">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); reset(); }} /> Solo vencidas
        </label>
      </div>

      {q.loading ? (
        <SkeletonList rows={6} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : tasks.length === 0 ? (
        <EmptyState icon={<CheckSquare />} title="No hay tareas" description="Cambia los filtros o crea una nueva tarea." action={<Button variant="primary" onClick={() => app.openTaskForm()}>Crear tarea</Button>} />
      ) : (
        <Panel className={cn("p-2 transition-opacity md:p-2", q.fetching && "opacity-60")}>
          <ul className="divide-y divide-line">
            {tasks.map((t) => {
              const done = t.status === "completed";
              const p = PRIORITY[t.priority];
              return (
                <li key={t.id} className="flex items-start gap-3 px-2 py-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={done ? `Reabrir «${t.title}»` : `Completar «${t.title}»`}
                    disabled={t.status === "cancelled"}
                    onClick={() => void patch(t, done ? "pending" : "completed", done ? "Tarea reabierta" : "Tarea completada")}
                    className={cn("mt-0.5 grid size-11 shrink-0 place-items-center rounded-control transition-colors disabled:opacity-40 md:size-7")}
                  >
                    <span className={cn("grid size-5 place-items-center rounded-md border-2 transition-colors", done ? "border-accent bg-accent text-accent-ink" : "border-line-strong hover:border-accent")}>{done && <Check className="size-3.5" aria-hidden />}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => app.openTaskForm(t)} className="block max-w-full truncate text-left text-sm font-medium hover:text-accent">
                      <span className={cn((done || t.status === "cancelled") && "line-through opacity-60")}>{t.title}</span>
                    </button>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={p.tone}>{p.label}</Badge>
                      {t.status !== "pending" && <Badge tone={t.status === "in_progress" ? "accent" : "neutral"}>{STATUS_LABEL[t.status]}</Badge>}
                      {t.dueLocalDate && (
                        <Badge tone={t.isOverdue ? "danger" : "neutral"}>
                          {t.isOverdue ? "Vencida · " : ""}
                          {fmtDateShort(t.dueLocalDate)} {t.dueLocalTime}
                        </Badge>
                      )}
                      {t.category && <Badge color={t.category.color}>{t.category.name}</Badge>}
                      {t.event && (
                        <button type="button" onClick={() => app.openEventDetail(t.event!.id)} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted hover:border-accent hover:text-accent">
                          <CalendarDays className="size-3" aria-hidden /> {t.event.title}
                        </button>
                      )}
                      {t.tags.map((x) => (
                        <Badge key={x.id} tone="accent" className="normal-case tracking-normal">#{x.name}</Badge>
                      ))}
                    </div>
                  </div>
                  <Menu
                    label={`Acciones de «${t.title}»`}
                    triggerClass="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-fg md:size-8"
                    trigger={<MoreHorizontal className="size-4" aria-hidden />}
                    items={[
                      { label: "Editar", icon: <Pencil className="size-4" aria-hidden />, onSelect: () => app.openTaskForm(t) },
                      ...(t.status !== "completed" ? [{ label: "Marcar completada", icon: <Check className="size-4" aria-hidden />, onSelect: () => void patch(t, "completed", "Tarea completada") }] : []),
                      ...(t.status === "pending" ? [{ label: "En progreso", icon: <CheckSquare className="size-4" aria-hidden />, onSelect: () => void patch(t, "in_progress", "Tarea en progreso") }] : []),
                      ...(t.status !== "cancelled" ? [{ label: "Cancelar tarea", icon: <XCircle className="size-4" aria-hidden />, onSelect: () => void patch(t, "cancelled", "Tarea cancelada") }] : [{ label: "Reabrir", icon: <CheckSquare className="size-4" aria-hidden />, onSelect: () => void patch(t, "pending", "Tarea reabierta") }]),
                      { label: "Eliminar", icon: <Trash2 className="size-4" aria-hidden />, onSelect: () => setDel(t), danger: true },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <Pager pagination={q.pagination} onPage={setPage} />
      <ConfirmDialog open={!!del} title="¿Eliminar tarea?" description={del ? `«${del.title}» se moverá a la papelera.` : undefined} confirmLabel="Eliminar" danger loading={busy} onConfirm={() => void remove()} onClose={() => setDel(null)} />
    </div>
  );
}
