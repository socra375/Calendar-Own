"use client";

import { createContext, useContext } from "react";
import type { AgendaItem, CategoryDto, EventDto, SettingsDto, SpecialDateDto, TagDto, TaskDto } from "@/lib/types";

export type Scope = "all" | "this" | "following";

export interface EventFormRequest {
  /** Edición: id de la serie/evento. */
  eventId?: string;
  occurrence?: EventDto;
  scope?: Scope;
  occurrenceKey?: string;
  defaults?: {
    title?: string;
    isAllDay?: boolean;
    startDate?: string;
    startTime?: string;
    /** Para día completo: último día incluido. */
    endDate?: string;
    endTime?: string;
    categoryId?: string | null;
  };
}

export interface AppCtx {
  user: { name: string; email: string };
  settings: SettingsDto | null;
  tz: string;
  weekStartsOn: number;
  categories: CategoryDto[];
  tags: TagDto[];
  unread: number;
  version: number;
  bump: () => void;
  openEventForm: (r?: EventFormRequest) => void;
  openEventDetail: (id: string, occurrence?: EventDto) => void;
  /** Abre el detalle/edición según el tipo del ítem de agenda (evento, tarea, fecha especial). */
  openAgendaItem: (item: AgendaItem) => void;
  openTaskForm: (task?: TaskDto | null, defaults?: { eventId?: string; eventTitle?: string }) => void;
  openSpecialDateForm: (sd?: SpecialDateDto | null) => void;
}

export const AppContext = createContext<AppCtx | null>(null);
export function useApp() {
  const c = useContext(AppContext);
  if (!c) throw new Error("AppProvider ausente");
  return c;
}
