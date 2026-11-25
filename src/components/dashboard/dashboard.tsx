"use client";

import { ArrowRight, CalendarCheck, Cake, CheckCircle2, Clock, Flame, Plus, Video } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { DynIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState, Panel, PanelHeader, Skeleton } from "@/components/ui/panel";
import { useApp } from "@/components/layout/app-context";
import { cn } from "@/lib/cn";
import { fmtDateFull, fmtDateShort, fmtDuration, fmtMonthDay, fmtWeekday, relativeFromNow, wall } from "@/lib/datetime";
import type { AgendaItem, DashboardDto } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";

function greeting(h: number) {
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

const PRIORITY_TONE = { urgent: "danger", high: "warm", medium: "neutral", low: "neutral" } as const;

function ItemButton({ item, children, className }: { item: AgendaItem; children: React.ReactNode; className?: string }) {
  const app = useApp();
  return (
    <button type="button" onClick={() => app.openAgendaItem(item)} className={cn("glow-hover flex min-h-11 w-full items-center gap-3 rounded-control border border-transparent px-2.5 py-2 text-left hover:bg-surface-2/60", className)}>
      {children}
    </button>
  );
}

export function Dashboard() {
  const app = useApp();
  const q = useApiQuery<DashboardDto>("/api/v1/dashboard");
  const now = useNow();

  if (q.error && !q.data) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  const d = q.data;
  const w = now ? wall(now, app.tz) : null;
  const name = app.settings?.displayName || app.user.name.split(" ")[0];
  const today = d?.today.localDate;

  // Línea de tiempo de hoy con marcador "ahora"
  const nowHHMM = w ? `${String(w.h).padStart(2, "0")}:${String(w.mi).padStart(2, "0")}` : null;
  const agenda = d?.todayAgenda ?? [];
  const nowIndex = nowHHMM ? agenda.findIndex((i) => !i.isAllDay && i.type === "event" && (i.localTime ?? "") > nowHHMM) : -1;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-label">{today ? fmtWeekday(today) : " "}</p>
          <h1 className="t-h1">
            {w ? greeting(w.h) : "Hola"}, {name}
          </h1>
          <p className="mt-1 text-muted">{today ? fmtDateFull(today) : <span aria-hidden className="skeleton inline-block h-4 w-40 align-middle" />}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => app.openEventForm()}>
            <Plus className="size-4" aria-hidden /> Evento
          </Button>
          <Button variant="outline" onClick={() => app.openTaskForm()}>
            <Plus className="size-4" aria-hidden /> Tarea
          </Button>
          <Link href="/calendar" className={buttonClass("outline")}>
            Calendario <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Agenda de hoy */}
        <Panel reticle className="lg:col-span-7 lg:row-span-2" aria-labelledby="h-today">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="t-label">Hoy</p>
              <h2 id="h-today" className="t-h2">Agenda de hoy</h2>
            </div>
            {d && <Badge tone="accent">{d.counts.eventsToday} eventos</Badge>}
          </div>
          {!d ? (
            <div className="space-y-3" role="status" aria-label="Cargando agenda">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : agenda.length === 0 ? (
            <EmptyState icon={<CalendarCheck />} title="Nada en la agenda de hoy" description="Día libre. Aprovecha para planificar algo." action={<Button variant="outline" onClick={() => app.openEventForm()}>Crear evento</Button>} />
          ) : (
            <ol className="relative space-y-1.5 border-l border-line pl-4">
              {agenda.map((it, i) => (
                <li key={`${it.type}-${it.id}-${it.occurrenceKey}`} className="relative">
                  {nowIndex === i && (
                    <div aria-label="Ahora" className="relative -mb-0.5 mb-2 flex items-center gap-2" role="separator">
                      <span className="pulse-dot absolute -left-[21px] size-2.5 rounded-full bg-accent" />
                      <span className="h-px flex-1 bg-accent/60" />
                      <span className="font-mono text-[11px] text-accent">{nowHHMM}</span>
                    </div>
                  )}
                  <ItemButton item={it}>
                    <span className="w-14 shrink-0 font-mono text-xs text-muted">{it.isAllDay || it.type !== "event" ? (it.type === "task" ? it.localTime ?? "tarea" : "día") : it.localTime}</span>
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: it.color ?? "var(--accent)" }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-medium", it.status === "cancelled" && "line-through opacity-60")}>{it.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {it.type === "task" ? "Tarea" : it.type === "special_date" ? "Fecha especial" : it.categoryName ?? "Evento"}
                        {it.type === "event" && it.endLocalTime && !it.isAllDay ? ` · hasta ${it.endLocalTime}` : ""}
                        {it.location ? ` · ${it.location}` : ""}
                      </span>
                    </span>
                    {it.type === "event" && typeof it.extra.meetingUrl === "string" && it.extra.meetingUrl && <Video className="size-4 shrink-0 text-accent" aria-label="Videollamada" />}
                  </ItemButton>
                </li>
              ))}
              {nowIndex === -1 && nowHHMM && agenda.some((i) => !i.isAllDay && i.type === "event") && (
                <li aria-label="Ahora" className="relative flex items-center gap-2 pt-1">
                  <span className="pulse-dot absolute -left-[21px] size-2.5 rounded-full bg-accent" />
                  <span className="h-px flex-1 bg-accent/60" />
                  <span className="font-mono text-[11px] text-accent">{nowHHMM}</span>
                </li>
              )}
            </ol>
          )}
          {d && d.freeSlotsToday.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="t-label mb-2">Huecos libres hoy</p>
              <div className="flex flex-wrap gap-1.5">
                {d.freeSlotsToday.slice(0, 5).map((s) => (
                  <Badge key={s.start} tone="success">
                    {s.start.slice(11, 16)}–{s.end.slice(11, 16)} · {fmtDuration(s.durationMinutes)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Próximo evento + resumen semanal */}
        <Panel className="lg:col-span-5" aria-labelledby="h-next">
          <PanelHeader label="Siguiente" title="Próximo evento" />
          <span id="h-next" className="sr-only">Próximo evento</span>
          {!d ? (
            <Skeleton className="h-20" />
          ) : d.nextEvent ? (
            <button type="button" onClick={() => app.openAgendaItem(d.nextEvent!)} className="glow-hover w-full rounded-card border border-line bg-surface-2/40 p-4 text-left">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge tone="accent">{d.nextEvent.start ? relativeFromNow(d.nextEvent.start, now || Date.parse(d.generatedAt)) : fmtDateShort(d.nextEvent.localDate)}</Badge>
                <span className="font-mono text-xs text-muted">{d.nextEvent.localTime ?? "Todo el día"}</span>
              </div>
              <p className="text-lg font-semibold">{d.nextEvent.title}</p>
              <p className="mt-1 text-sm text-muted">
                {fmtDateShort(d.nextEvent.localDate)}
                {d.nextEvent.location ? ` · ${d.nextEvent.location}` : ""}
              </p>
            </button>
          ) : (
            <p className="text-sm text-muted">No hay eventos próximos.</p>
          )}
          {d && (
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
              {[
                { l: "Eventos semana", v: d.counts.eventsThisWeek, i: <Clock className="size-3.5" /> },
                { l: "Pendientes", v: d.tasks.pending + d.tasks.inProgress, i: <CheckCircle2 className="size-3.5" /> },
                { l: "Vencidas", v: d.tasks.overdue, i: <Flame className="size-3.5" />, warn: d.tasks.overdue > 0 },
                { l: "Hechas semana", v: d.tasks.completedThisWeek, i: <CheckCircle2 className="size-3.5" /> },
              ].map((m) => (
                <div key={m.l} className="rounded-control border border-line px-3 py-2">
                  <dt className="t-label flex items-center gap-1 truncate">{m.i}{m.l}</dt>
                  <dd className={cn("font-mono text-2xl", m.warn && "text-danger")}>{m.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        {/* Próximos eventos */}
        <Panel className="lg:col-span-5" aria-labelledby="h-up">
          <PanelHeader label="Pronto" title="Próximos eventos" action={<Link href="/agenda" className="inline-flex min-h-11 items-center text-xs text-accent hover:underline md:min-h-0">Ver agenda</Link>} />
          <span id="h-up" className="sr-only">Próximos eventos</span>
          {!d ? (
            <Skeleton className="h-24" />
          ) : d.upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted">Sin eventos en los próximos días.</p>
          ) : (
            <ul className="space-y-1">
              {d.upcomingEvents.slice(0, 5).map((it) => (
                <li key={`${it.id}-${it.occurrenceKey}`}>
                  <ItemButton item={it}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: it.color ?? "var(--accent)" }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      {fmtDateShort(it.localDate)} {it.localTime ?? ""}
                    </span>
                  </ItemButton>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Tareas */}
        <Panel className="lg:col-span-6" aria-labelledby="h-tasks">
          <PanelHeader label="Pendiente" title="Tareas" action={<Link href="/tasks" className="inline-flex min-h-11 items-center text-xs text-accent hover:underline md:min-h-0">Ver todas</Link>} />
          <span id="h-tasks" className="sr-only">Tareas pendientes y vencidas</span>
          {!d ? (
            <Skeleton className="h-24" />
          ) : d.tasks.overdueList.length + d.tasks.dueSoon.length === 0 ? (
            <EmptyState icon={<CheckCircle2 />} title="Todo al día" description="No hay tareas vencidas ni próximas a vencer." />
          ) : (
            <ul className="space-y-1">
              {[...d.tasks.overdueList.map((t) => ({ t, od: true })), ...d.tasks.dueSoon.map((t) => ({ t, od: false }))].slice(0, 6).map(({ t, od }) => (
                <li key={t.id}>
                  <ItemButton item={t}>
                    <Flame className={cn("size-4 shrink-0", od ? "text-danger" : "text-warm")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    {typeof t.extra.priority === "string" && t.extra.priority !== "medium" && t.extra.priority !== "low" && <Badge tone={PRIORITY_TONE[t.extra.priority as keyof typeof PRIORITY_TONE]}>{t.extra.priority === "urgent" ? "Urgente" : "Alta"}</Badge>}
                    <span className={cn("shrink-0 font-mono text-[11px]", od ? "text-danger" : "text-muted")}>{od ? "vencida " : ""}{fmtDateShort(t.localDate)}</span>
                  </ItemButton>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Fechas */}
        <Panel className="lg:col-span-6" aria-labelledby="h-sd">
          <PanelHeader label="Calendario personal" title="Cumpleaños y fechas" action={<Link href="/special-dates" className="inline-flex min-h-11 items-center text-xs text-accent hover:underline md:min-h-0">Ver todas</Link>} />
          <span id="h-sd" className="sr-only">Próximos cumpleaños y fechas especiales</span>
          {!d ? (
            <Skeleton className="h-24" />
          ) : d.upcomingSpecialDates.length === 0 ? (
            <p className="text-sm text-muted">No hay fechas especiales próximas.</p>
          ) : (
            <ul className="space-y-1">
              {d.upcomingSpecialDates.slice(0, 5).map((s) => {
                const days = Math.max(0, Math.round((Date.parse(`${s.localDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000));
                return (
                  <li key={`${s.id}-${s.localDate}`}>
                    <ItemButton item={s}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${s.color ?? "var(--accent)"} 18%, transparent)`, color: s.color ?? "var(--accent)" }}>
                        <DynIcon name={typeof s.extra.icon === "string" ? s.extra.icon : s.extra.specialType === "birthday" ? "cake" : "star"} className="size-4" fallback="star" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{s.title}</span>
                        <span className="block text-xs text-muted">{fmtMonthDay(s.localDate)}{typeof s.extra.yearsSince === "number" ? ` · ${s.extra.yearsSince} años` : ""}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-accent">{days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} d`}</span>
                    </ItemButton>
                  </li>
                );
              })}
            </ul>
          )}
          {d?.nextBirthday && (
            <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
              <Cake className="size-3.5 text-accent" aria-hidden /> Próximo cumpleaños: <span className="text-fg">{d.nextBirthday.title}</span> · {fmtMonthDay(d.nextBirthday.localDate)}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
