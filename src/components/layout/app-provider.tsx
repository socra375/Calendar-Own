"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EventDetailDialog } from "@/components/events/event-detail";
import { EventForm } from "@/components/events/event-form";
import { SpecialDateForm } from "@/components/special-dates/special-date-form";
import { TaskForm, type TaskFormRequest } from "@/components/tasks/task-form";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import type { AgendaItem, CategoryDto, NotificationDto, SettingsDto, SpecialDateDto, TagDto, TaskDto } from "@/lib/types";
import { VersionProvider, errMsg, qs, useApiQuery, useVersion } from "@/lib/use-api";
import type { DetailTarget } from "@/components/events/event-detail";
import { AppContext, type AppCtx, type EventFormRequest } from "./app-context";

export function AppProvider({ user, children }: { user: { name: string; email: string }; children: ReactNode }) {
  return (
    <VersionProvider>
      <ToastProvider>
        <Inner user={user}>{children}</Inner>
      </ToastProvider>
    </VersionProvider>
  );
}

function Inner({ user, children }: { user: { name: string; email: string }; children: ReactNode }) {
  const { version, bump } = useVersion();
  const toast = useToast();
  const settingsQ = useApiQuery<SettingsDto>("/api/v1/settings");
  const catQ = useApiQuery<CategoryDto[]>(`/api/v1/categories${qs({ pageSize: 100 })}`);
  const tagQ = useApiQuery<TagDto[]>(`/api/v1/tags${qs({ pageSize: 100 })}`);
  const unreadQ = useApiQuery<NotificationDto[]>(`/api/v1/notifications${qs({ unread: true, channel: "internal", pageSize: 1 })}`);

  const reload = useRef(unreadQ.reload);
  useEffect(() => {
    reload.current = unreadQ.reload;
  });
  useEffect(() => {
    const id = window.setInterval(() => reload.current(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [eventForm, setEventForm] = useState<EventFormRequest | null>(null);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormRequest | null>(null);
  const [sdForm, setSdForm] = useState<{ sd: SpecialDateDto | null } | null>(null);

  const value = useMemo<AppCtx>(
    () => ({
      user,
      settings: settingsQ.data ?? null,
      tz: settingsQ.data?.timezone ?? DEFAULT_TIMEZONE,
      weekStartsOn: settingsQ.data?.weekStartsOn ?? 1,
      categories: catQ.data ?? [],
      tags: tagQ.data ?? [],
      // meta.unreadCount = no leídas internas (un COUNT barato); el total paginado es el respaldo.
      unread: (typeof unreadQ.meta?.unreadCount === "number" ? unreadQ.meta.unreadCount : unreadQ.pagination?.total) ?? 0,
      version,
      bump,
      openEventForm: (r) => setEventForm(r ?? {}),
      openEventDetail: (id, occurrence) => setDetail({ id, occurrence }),
      openAgendaItem: (it: AgendaItem) => {
        if (it.type === "event") setDetail({ id: it.id, hint: { occurrenceKey: it.occurrenceKey, localDate: it.localDate } });
        else if (it.type === "task")
          apiFetch<TaskDto>(`/api/v1/tasks/${it.id}`).then((r) => setTaskForm({ task: r.data })).catch((e) => toast.error(errMsg(e)));
        else apiFetch<SpecialDateDto>(`/api/v1/special-dates/${it.id}`).then((r) => setSdForm({ sd: r.data })).catch((e) => toast.error(errMsg(e)));
      },
      openTaskForm: (task, defaults) => setTaskForm({ task: task ?? null, defaults }),
      openSpecialDateForm: (sd) => setSdForm({ sd: sd ?? null }),
    }),
    [user, settingsQ.data, catQ.data, tagQ.data, unreadQ.meta, unreadQ.pagination, version, bump, toast],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <EventDetailDialog target={detail} onClose={() => setDetail(null)} />
      <EventForm request={eventForm} onClose={() => setEventForm(null)} />
      <TaskForm request={taskForm} onClose={() => setTaskForm(null)} />
      <SpecialDateForm request={sdForm} onClose={() => setSdForm(null)} />
    </AppContext.Provider>
  );
}
