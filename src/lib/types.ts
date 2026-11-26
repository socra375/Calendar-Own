// Tipos de la UI derivados de los schemas Zod compartidos (sin importar nada de src/server).
import type { z } from "zod";
import type { agendaItemOut, dashboardOut } from "./validation/agenda";
import type { categoryOut } from "./validation/categories";
import type { conflictItemOut } from "./validation/common";
import type { eventOut } from "./validation/events";
import type { settingsOut } from "./validation/settings";
import type { specialDateOut } from "./validation/special-dates";
import type { tagOut } from "./validation/tags";
import type { taskOut } from "./validation/tasks";
import type { tokenOut } from "./validation/tokens";
import type { auditOut } from "./validation/audit-logs";
import type { searchOut } from "./validation/search";

export type EventDto = z.infer<typeof eventOut> & {
  seriesId?: string | null;
  occurrenceKey?: string;
  isException?: boolean;
};
export type EventReminder = { id: string; offsetMinutes: number; channel: "internal" | "telegram" | "email"; isActive: boolean };
export type EventDetail = EventDto & {
  exceptions: { occurrenceKey: string; kind: string; overrides: unknown }[];
  reminders: EventReminder[];
};
export type TaskDto = z.infer<typeof taskOut>;
export type SpecialDateDto = z.infer<typeof specialDateOut>;
export type CategoryDto = z.infer<typeof categoryOut>;
export type TagDto = z.infer<typeof tagOut>;
export type SettingsDto = z.infer<typeof settingsOut>;
export type TokenDto = z.infer<typeof tokenOut>;
export type AuditDto = z.infer<typeof auditOut>;
export type ConflictDto = z.infer<typeof conflictItemOut>;
export type AgendaItem = z.infer<typeof agendaItemOut>;
export type DashboardDto = z.infer<typeof dashboardOut>;
export type SearchDto = z.infer<typeof searchOut>;

export interface NotificationDto {
  id: string;
  channel: "internal" | "telegram" | "email";
  targetType: "event" | "task" | "special_date";
  targetId: string;
  occurrenceKey: string;
  scheduledFor: string;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface HealthDto {
  status: string;
  database: string;
  version: string;
  serverTime: string;
  timezone: string;
  integrations: { telegram: boolean; email: boolean };
}

export interface MeDto {
  user: { id: string; email: string; name: string };
  settings: { timezone: string; theme: string; displayName: string | null } | null;
}
