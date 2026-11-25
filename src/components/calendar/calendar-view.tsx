"use client";

import esLocale from "@fullcalendar/core/locales/es";
import type { DatesSetArg, EventChangeArg, EventClickArg, EventInput, DateSelectArg, EventSourceFuncArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import FullCalendar from "@fullcalendar/react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/layout/app-context";
import { ScopeDialog } from "@/components/events/scope-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { PageHeader, Skeleton } from "@/components/ui/panel";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { readableOn } from "@/lib/color";
import { addDays, floating, floatingDate, floatingToIso, localDate, nowMs, wall } from "@/lib/datetime";
import type { ConflictDto, EventDetail, EventDto } from "@/lib/types";
import { errMsg, qs, useVersion } from "@/lib/use-api";
import { useMounted, usePref } from "@/lib/use-pref";
import type { Scope } from "@/components/layout/app-context";

const VIEWS = [
  { id: "dayGridMonth", label: "Mes" },
  { id: "timeGridWeek", label: "Semana" },
  { id: "timeGridDay", label: "Día" },
  { id: "listWeek", label: "Agenda" },
];

interface Move {
  dto: EventDto;
  start: Date;
  end: Date | null;
  allDay: boolean;
  oldStart: Date;
  oldEnd: Date | null;
  revert: () => void;
}

const DAY = 86_400_000;

export function CalendarView() {
  const app = useApp();
  const toast = useToast();
  const { version } = useVersion();
  const mounted = useMounted();
  const [viewPref, setViewPref] = usePref("pc:calview", "");
  const cal = useRef<FullCalendar>(null);
  const [title, setTitle] = useState("");
  const [view, setView] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [moving, setMoving] = useState<Move | null>(null);
  const [saving, setSaving] = useState(false);
  const [forceAsk, setForceAsk] = useState<{ move: Move; scope: Scope; conflicts: ConflictDto[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tz = app.tz;

  const filters = useRef({ categoryId, q, tz });
  useEffect(() => {
    filters.current = { categoryId, q, tz };
  });

  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  // Revalida eventos al cambiar filtros, versión global o zona horaria.
  useEffect(() => {
    cal.current?.getApi().refetchEvents();
  }, [categoryId, q, version, tz]);

  const fetchEvents = useCallback(async (info: EventSourceFuncArg, ok: (e: EventInput[]) => void, fail: (e: Error) => void) => {
    const { categoryId: cat, q: text, tz: zone } = filters.current;
    try {
      const from = floatingDate(info.start);
      const to = addDays(floatingDate(info.end), -1);
      const all: EventDto[] = [];
      for (let page = 1; page <= 30; page++) {
        const r = await apiFetch<EventDto[]>(`/api/v1/events${qs({ from, to, categoryId: cat, q: text, page, pageSize: 100 })}`);
        all.push(...r.data);
        if (!r.pagination || page >= r.pagination.totalPages) break;
      }
      setLoadError(null);
      ok(
        all.map((e): EventInput => {
          const color = e.color ?? e.category?.color ?? null;
          const base: EventInput = {
            id: `${e.id}:${e.occurrenceKey}`,
            title: e.title,
            allDay: e.isAllDay,
            classNames: [e.status === "tentative" ? "ev-tentative" : "", e.status === "cancelled" ? "ev-cancelled" : "", color ? "" : "ev-default"].filter(Boolean),
            extendedProps: { dto: e },
            ...(color ? { backgroundColor: color, borderColor: color, textColor: readableOn(color) } : {}),
          };
          if (e.isAllDay) return { ...base, start: e.startDate!, end: e.endDate! };
          return { ...base, start: floating(e.startAt!, zone), end: floating(e.endAt!, zone) };
        }),
      );
    } catch (e) {
      setLoadError(errMsg(e));
      fail(e as Error);
    }
  }, []);

  function onDatesSet(a: DatesSetArg) {
    setTitle(a.view.title);
    setView(a.view.type);
  }

  function changeView(id: string) {
    cal.current?.getApi().changeView(id);
    setViewPref(id);
  }

  function onSelect(s: DateSelectArg) {
    cal.current?.getApi().unselect();
    const oneDay = s.allDay && s.end.getTime() - s.start.getTime() <= DAY;
    if (s.allDay && !oneDay) {
      app.openEventForm({ defaults: { isAllDay: true, startDate: floatingDate(s.start), endDate: addDays(floatingDate(s.end), -1) } });
    } else if (oneDay) {
      app.openEventForm({ defaults: { startDate: floatingDate(s.start), startTime: "09:00", endDate: floatingDate(s.start), endTime: "10:00" } });
    } else {
      const p = (n: number) => String(n).padStart(2, "0");
      app.openEventForm({
        defaults: {
          startDate: floatingDate(s.start),
          startTime: `${p(s.start.getUTCHours())}:${p(s.start.getUTCMinutes())}`,
          endDate: floatingDate(s.end),
          endTime: `${p(s.end.getUTCHours())}:${p(s.end.getUTCMinutes())}`,
        },
      });
    }
  }

  function onEventClick(c: EventClickArg) {
    c.jsEvent.preventDefault();
    const dto = c.event.extendedProps.dto as EventDto;
    app.openEventDetail(dto.id, dto);
  }

  function onChange(c: EventChangeArg) {
    const dto = c.event.extendedProps.dto as EventDto;
    const move: Move = {
      dto,
      start: c.event.start!,
      end: c.event.end,
      allDay: c.event.allDay,
      oldStart: c.oldEvent.start!,
      oldEnd: c.oldEvent.end,
      revert: c.revert,
    };
    if (dto.isRecurring) setMoving(move);
    else void apply(move, "all", false);
  }

  /** Construye el PATCH según el alcance y lo envía. */
  async function apply(m: Move, scope: Scope, force: boolean) {
    setSaving(true);
    const { dto } = m;
    try {
      const body: Record<string, unknown> = { force };
      if (scope === "all" && dto.isRecurring) {
        // Desplaza la serie completa por el delta de pared (a prueba de DST).
        const master = (await apiFetch<EventDetail>(`/api/v1/events/${dto.id}`)).data;
        if (dto.isAllDay) {
          const ds = Math.round((m.start.getTime() - m.oldStart.getTime()) / DAY);
          const de = m.end && m.oldEnd ? Math.round((m.end.getTime() - m.oldEnd.getTime()) / DAY) : ds;
          body.startDate = addDays(master.startDate!, ds);
          body.endDate = addDays(master.endDate!, de);
        } else {
          const ds = m.start.getTime() - m.oldStart.getTime();
          const de = m.end && m.oldEnd ? m.end.getTime() - m.oldEnd.getTime() : ds;
          body.startAt = floatingToIso(new Date(floating(master.startAt!, tz).getTime() + ds), tz);
          body.endAt = floatingToIso(new Date(floating(master.endAt!, tz).getTime() + de), tz);
        }
      } else if (dto.isAllDay) {
        body.startDate = floatingDate(m.start);
        body.endDate = m.end ? floatingDate(m.end) : addDays(floatingDate(m.start), 1);
      } else {
        body.startAt = floatingToIso(m.start, tz);
        const end = m.end ?? new Date(m.start.getTime() + dto.durationMinutes * 60_000);
        body.endAt = floatingToIso(end, tz);
      }
      const r = await apiFetch<EventDetail>(`/api/v1/events/${dto.id}${qs({ scope, occurrenceKey: scope === "all" ? undefined : dto.occurrenceKey })}`, { method: "PATCH", body });
      const n = (r.meta.conflicts as unknown[] | undefined)?.length ?? 0;
      toast.success(n ? `Evento movido (${n} conflicto${n > 1 ? "s" : ""} de horario)` : "Evento actualizado");
      setMoving(null);
      setForceAsk(null);
      app.bump();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "BLOCKING_CONFLICT") {
        setMoving(null);
        setForceAsk({ move: m, scope, conflicts: ((e.details as { conflicts?: ConflictDto[] })?.conflicts) ?? [] });
      } else {
        toast.error(errMsg(e));
        m.revert();
        setMoving(null);
      }
    } finally {
      setSaving(false);
    }
  }

  const nowFn = useCallback(() => floating(nowMs(), filters.current.tz), []);
  const initialView = useCallback(() => (viewPref && VIEWS.some((v) => v.id === viewPref) ? viewPref : window.innerWidth < 768 ? "listWeek" : "dayGridMonth"), [viewPref]);
  const startHour = mounted ? Math.max(wall(nowMs(), tz).h - 1, 0) : 7;

  return (
    <div>
      <PageHeader
        title="Calendario"
        subtitle="Arrastra para mover, estira para cambiar la duración, selecciona un rango para crear."
        actions={
          <Button variant="primary" onClick={() => app.openEventForm({ defaults: { startDate: localDate(nowMs(), tz) } })}>
            <Plus className="size-4" aria-hidden /> Nuevo evento
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Anterior" onClick={() => cal.current?.getApi().prev()}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button variant="outline" size="icon" aria-label="Siguiente" onClick={() => cal.current?.getApi().next()}>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <Button variant="outline" size="md" onClick={() => cal.current?.getApi().today()}>
              Hoy
            </Button>
            <h2 className="t-h2 ml-2 min-w-0 truncate first-letter:uppercase" aria-live="polite">
              {title || "\u00a0"}
            </h2>
          </div>
          <Tabs tabs={VIEWS} value={view} onChange={changeView} label="Vista del calendario" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Filtrar por categoría" className="w-full sm:w-52" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas las categorías</option>
            {app.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="relative min-w-40 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" aria-label="Buscar en el calendario" placeholder="Buscar en el calendario…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="mb-3 rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          No se pudieron cargar los eventos: {loadError}
          <button className="ml-2 underline" onClick={() => cal.current?.getApi().refetchEvents()}>
            Reintentar
          </button>
        </p>
      )}

      <div className="rounded-card border border-line bg-surface p-2 md:p-3" data-testid="calendar">
        {!mounted ? (
          <Skeleton className="h-[60dvh]" />
        ) : (
          <FullCalendar
            ref={cal}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={initialView()}
            headerToolbar={false}
            locale={esLocale}
            timeZone="UTC"
            now={nowFn}
            firstDay={app.weekStartsOn}
            nowIndicator
            navLinks={false}
            selectable
            selectMirror
            selectLongPressDelay={350}
            editable
            eventLongPressDelay={350}
            eventAllow={(drop, ev) => drop.allDay === ev?.allDay}
            eventDisplay="block"
            dayMaxEvents={4}
            height="auto"
            scrollTime={`${String(startHour).padStart(2, "0")}:00:00`}
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            listDayFormat={{ weekday: "long", day: "numeric", month: "long" }}
            listDaySideFormat={false}
            noEventsText="No hay eventos en este periodo"
            events={fetchEvents}
            datesSet={onDatesSet}
            select={onSelect}
            eventClick={onEventClick}
            eventChange={onChange}
            eventDidMount={(a) => {
              const d = a.event.extendedProps.dto as EventDto | undefined;
              if (!d) return; // evento "espejo" de la selección
              a.el.setAttribute("aria-label", `${d.title}, ${d.isAllDay ? "todo el día" : `${d.localTime} a ${d.endLocalTime}`}, ${d.localDate}`);
            }}
          />
        )}
      </div>

      <ScopeDialog
        open={!!moving}
        title="Mover evento recurrente"
        description="¿A qué ocurrencias aplicar el cambio?"
        confirmLabel="Aplicar"
        loading={saving}
        onConfirm={(s) => moving && void apply(moving, s, false)}
        onClose={() => {
          moving?.revert();
          setMoving(null);
        }}
      />
      <ConfirmDialog
        open={!!forceAsk}
        title="Conflicto con un evento bloqueante"
        description="El nuevo horario choca con un evento bloqueante. ¿Guardar de todos modos?"
        confirmLabel="Guardar de todos modos"
        danger
        loading={saving}
        onConfirm={() => forceAsk && void apply(forceAsk.move, forceAsk.scope, true)}
        onClose={() => {
          forceAsk?.move.revert();
          setForceAsk(null);
        }}
      >
        <ul className="space-y-1 text-sm">
          {forceAsk?.conflicts.map((c) => (
            <li key={c.eventId + c.occurrenceKey}>
              <strong>{c.title}</strong> <span className="font-mono text-xs text-muted">{c.localDate} {c.localStartTime ?? ""}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}
