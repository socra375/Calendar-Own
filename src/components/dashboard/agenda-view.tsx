"use client";

import { CalendarOff, Video } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/layout/app-context";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/pickers";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonList } from "@/components/ui/panel";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { fmtDateLong, fmtDuration, localDate, nowMs } from "@/lib/datetime";
import type { AgendaItem } from "@/lib/types";
import { qs, useApiQuery } from "@/lib/use-api";

interface AgendaOut {
  range: { localFrom: string; localTo: string; timezone: string };
  days: { localDate: string; weekday: string; items: AgendaItem[] }[];
  summary: { events: number; tasks: number; specialDates: number; busyMinutes: number };
}

const RANGES = [
  { id: "today", label: "Hoy" },
  { id: "tomorrow", label: "Mañana" },
  { id: "week", label: "Esta semana" },
  { id: "next_week", label: "Próxima semana" },
  { id: "date", label: "Fecha" },
];

export function AgendaView() {
  const app = useApp();
  const [range, setRange] = useState("today");
  const [date, setDate] = useState(() => localDate(nowMs(), app.tz));
  const [tasks, setTasks] = useState(true);
  const q = useApiQuery<AgendaOut>(`/api/v1/agenda${qs({ range, date: range === "date" ? date : undefined, includeTasks: tasks })}`);
  const d = q.data;

  return (
    <div>
      <PageHeader title="Agenda" subtitle={d ? `${fmtDateLong(d.range.localFrom)}${d.range.localTo !== d.range.localFrom ? ` → ${fmtDateLong(d.range.localTo)}` : ""} · ${d.range.timezone}` : "Cargando…"} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs tabs={RANGES} value={range} onChange={setRange} label="Rango de la agenda" />
        {range === "date" && <DatePicker aria-label="Fecha de la agenda" className="w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted md:min-h-0">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={tasks} onChange={(e) => setTasks(e.target.checked)} /> Incluir tareas
        </label>
      </div>

      {q.loading ? (
        <SkeletonList rows={5} />
      ) : q.error && !d ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : d && d.days.every((x) => x.items.length === 0) ? (
        <EmptyState icon={<CalendarOff />} title="Sin actividad en este rango" description="No hay eventos, tareas ni fechas especiales." />
      ) : d ? (
        <div className={cn("space-y-4 transition-opacity", q.fetching && "opacity-60")}>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{d.summary.events} eventos</Badge>
            <Badge tone="warm">{d.summary.tasks} tareas</Badge>
            <Badge>{d.summary.specialDates} fechas</Badge>
            <Badge tone="success">{fmtDuration(d.summary.busyMinutes)} ocupado</Badge>
          </div>
          {d.days
            .filter((day) => day.items.length)
            .map((day) => (
              <Panel key={day.localDate} aria-label={fmtDateLong(day.localDate)}>
                <h2 className="t-label mb-2 capitalize">{fmtDateLong(day.localDate)}</h2>
                <ul className="space-y-1">
                  {day.items.map((it) => (
                    <li key={`${it.type}-${it.id}-${it.occurrenceKey}`}>
                      <button type="button" onClick={() => app.openAgendaItem(it)} className="glow-hover flex w-full items-center gap-3 rounded-control border border-transparent px-2.5 py-2 text-left hover:bg-surface-2/60">
                        <span className="w-24 shrink-0 font-mono text-xs text-muted">{it.isAllDay || !it.localTime ? (it.type === "special_date" ? "fecha" : "todo el día") : `${it.localTime}${it.endLocalTime ? `–${it.endLocalTime}` : ""}`}</span>
                        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: it.color ?? (it.type === "task" ? "var(--warm)" : "var(--accent)") }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm font-medium", (it.status === "cancelled" || it.status === "completed") && "line-through opacity-60")}>{it.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {it.type === "task" ? "Tarea" : it.type === "special_date" ? "Fecha especial" : it.categoryName ?? "Evento"}
                            {it.location ? ` · ${it.location}` : ""}
                          </span>
                        </span>
                        {typeof it.extra.meetingUrl === "string" && it.extra.meetingUrl && <Video className="size-4 text-accent" aria-label="Videollamada" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
        </div>
      ) : null}
    </div>
  );
}
