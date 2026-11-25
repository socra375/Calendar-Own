import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------
export const themeEnum = pgEnum("theme", ["light", "dark", "system"]);
export const meetingProviderEnum = pgEnum("meeting_provider", ["google_meet", "zoom", "teams", "other"]);
export const eventStatusEnum = pgEnum("event_status", ["confirmed", "tentative", "cancelled"]);
export const sourceEnum = pgEnum("source", ["ui", "eddie", "system"]);
export const exceptionKindEnum = pgEnum("exception_kind", ["cancelled", "modified"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "completed", "cancelled"]);
export const specialDateTypeEnum = pgEnum("special_date_type", [
  "birthday",
  "holiday",
  "celebration",
  "anniversary",
  "personal",
]);
export const reminderTargetEnum = pgEnum("reminder_target_type", ["event", "task", "special_date"]);
export const notificationChannelEnum = pgEnum("notification_channel", ["internal", "telegram", "email"]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
]);
export const actorTypeEnum = pgEnum("actor_type", ["user", "eddie", "system"]);
export const auditResultEnum = pgEnum("audit_result", ["success", "failure"]);

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tz("created_at").notNull().defaultNow();
const updatedAt = () => tz("updated_at").notNull().defaultNow();
const pk = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const userFk = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

// ---------- users / sessions / rate limits ----------
export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    userId: userFk(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: tz("expires_at").notNull(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: tz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// ---------- settings ----------
export type DefaultReminder = { offsetMinutes: number; channel: "internal" | "telegram" | "email" };

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("America/Santo_Domingo"),
  theme: themeEnum("theme").notNull().default("system"),
  weekStartsOn: smallint("week_starts_on").notNull().default(1),
  workDayStart: time("work_day_start").notNull().default("08:00"),
  workDayEnd: time("work_day_end").notNull().default("18:00"),
  workDays: smallint("work_days").array().notNull().default(sql`'{1,2,3,4,5}'::smallint[]`),
  defaultReminders: jsonb("default_reminders")
    .$type<DefaultReminder[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  telegramEnabled: boolean("telegram_enabled").notNull().default(false),
  telegramChatId: text("telegram_chat_id"),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  notificationEmail: text("notification_email"),
  updatedAt: updatedAt(),
});

// ---------- categories / tags ----------
export const categories = pgTable(
  "categories",
  {
    id: pk(),
    userId: userFk(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#3b82f6"),
    icon: text("icon"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tz("deleted_at"),
  },
  (t) => [
    uniqueIndex("categories_user_name_uq")
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: pk(),
    userId: userFk(),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_user_name_uq").on(t.userId, sql`lower(${t.name})`)],
);

// ---------- events ----------
export const events = pgTable(
  "events",
  {
    id: pk(),
    userId: userFk(),
    title: text("title").notNull(),
    description: text("description"),
    notes: text("notes"),
    isAllDay: boolean("is_all_day").notNull().default(false),
    startAt: tz("start_at"),
    endAt: tz("end_at"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }), // EXCLUSIVO
    timezone: text("timezone").notNull().default("America/Santo_Domingo"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    color: text("color"),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    meetingProvider: meetingProviderEnum("meeting_provider"),
    status: eventStatusEnum("status").notNull().default("confirmed"),
    isBlocking: boolean("is_blocking").notNull().default(false),
    source: sourceEnum("source").notNull().default("ui"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tz("deleted_at"),
  },
  (t) => [
    check(
      "events_time_chk",
      sql`(
        (${t.isAllDay} = true and ${t.startDate} is not null and ${t.endDate} is not null and ${t.endDate} > ${t.startDate})
        or
        (${t.isAllDay} = false and ${t.startAt} is not null and ${t.endAt} is not null and ${t.endAt} >= ${t.startAt})
      )`,
    ),
    index("events_user_start_at_idx").on(t.userId, t.startAt),
    index("events_user_start_date_idx").on(t.userId, t.startDate),
    index("events_category_idx").on(t.categoryId),
  ],
);

export const eventRecurrence = pgTable("event_recurrence", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  rrule: text("rrule").notNull(),
  seriesEndAt: tz("series_end_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type EventOverrides = Partial<{
  title: string;
  description: string | null;
  start: string;
  end: string;
  location: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  notes: string | null;
  meetingUrl: string | null;
  color: string | null;
}>;

export const eventExceptions = pgTable(
  "event_exceptions",
  {
    id: pk(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    occurrenceKey: text("occurrence_key").notNull(),
    kind: exceptionKindEnum("kind").notNull(),
    overrides: jsonb("overrides").$type<EventOverrides>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("event_exceptions_uq").on(t.eventId, t.occurrenceKey)],
);

export const eventTags = pgTable(
  "event_tags",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.tagId] }), index("event_tags_tag_idx").on(t.tagId)],
);

// ---------- tasks ----------
export const tasks = pgTable(
  "tasks",
  {
    id: pk(),
    userId: userFk(),
    title: text("title").notNull(),
    description: text("description"),
    dueAt: tz("due_at"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    status: taskStatusEnum("status").notNull().default("pending"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    completedAt: tz("completed_at"),
    source: sourceEnum("source").notNull().default("ui"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tz("deleted_at"),
  },
  (t) => [
    index("tasks_user_due_idx").on(t.userId, t.dueAt),
    index("tasks_user_status_idx").on(t.userId, t.status),
  ],
);

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] }), index("task_tags_tag_idx").on(t.tagId)],
);

// ---------- special dates ----------
export const specialDates = pgTable(
  "special_dates",
  {
    id: pk(),
    userId: userFk(),
    title: text("title").notNull(),
    type: specialDateTypeEnum("type").notNull().default("personal"),
    date: date("date", { mode: "string" }).notNull(),
    recursYearly: boolean("recurs_yearly").notNull().default(false),
    color: text("color"),
    icon: text("icon"),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tz("deleted_at"),
  },
  (t) => [index("special_dates_user_date_idx").on(t.userId, t.date)],
);

// ---------- reminders / notifications ----------
export const reminders = pgTable(
  "reminders",
  {
    id: pk(),
    userId: userFk(),
    targetType: reminderTargetEnum("target_type").notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    specialDateId: uuid("special_date_id").references(() => specialDates.id, { onDelete: "cascade" }),
    offsetMinutes: integer("offset_minutes").notNull(),
    channel: notificationChannelEnum("channel").notNull().default("internal"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("reminders_offset_chk", sql`${t.offsetMinutes} >= 0`),
    check(
      "reminders_target_chk",
      sql`(
        (${t.targetType} = 'event' and ${t.eventId} is not null and ${t.taskId} is null and ${t.specialDateId} is null)
        or (${t.targetType} = 'task' and ${t.taskId} is not null and ${t.eventId} is null and ${t.specialDateId} is null)
        or (${t.targetType} = 'special_date' and ${t.specialDateId} is not null and ${t.eventId} is null and ${t.taskId} is null)
      )`,
    ),
    index("reminders_user_idx").on(t.userId),
    index("reminders_event_idx").on(t.eventId),
    index("reminders_task_idx").on(t.taskId),
    index("reminders_special_date_idx").on(t.specialDateId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: userFk(),
    reminderId: uuid("reminder_id").references(() => reminders.id, { onDelete: "set null" }),
    channel: notificationChannelEnum("channel").notNull(),
    targetType: reminderTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    occurrenceKey: text("occurrence_key").notNull(),
    scheduledFor: tz("scheduled_for").notNull(),
    status: notificationStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: tz("next_attempt_at").notNull().defaultNow(),
    lastError: text("last_error"),
    sentAt: tz("sent_at"),
    title: text("title").notNull(),
    body: text("body"),
    readAt: tz("read_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Anti-duplicados (reminder_id NULL no colisiona: notificaciones de prueba/sistema)
    uniqueIndex("notifications_reminder_occ_uq").on(t.reminderId, t.occurrenceKey),
    index("notifications_due_idx").on(t.status, t.scheduledFor),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ],
);

// ---------- api tokens / audit ----------
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: pk(),
    userId: userFk(),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes").array().notNull().default(sql`'{*}'::text[]`),
    lastUsedAt: tz("last_used_at"),
    expiresAt: tz("expires_at"),
    revokedAt: tz("revoked_at"),
    rotatedFromId: uuid("rotated_from_id"),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    apiTokenId: uuid("api_token_id").references(() => apiTokens.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    result: auditResultEnum("result").notNull().default("success"),
    changes: jsonb("changes"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("audit_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_action_idx").on(t.action),
  ],
);

// ---------- relations ----------
export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),
  sessions: many(sessions),
  categories: many(categories),
  events: many(events),
  tasks: many(tasks),
  tokens: many(apiTokens),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, { fields: [userSettings.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  events: many(events),
  tasks: many(tasks),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  eventTags: many(eventTags),
  taskTags: many(taskTags),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, { fields: [events.userId], references: [users.id] }),
  category: one(categories, { fields: [events.categoryId], references: [categories.id] }),
  recurrence: one(eventRecurrence, { fields: [events.id], references: [eventRecurrence.eventId] }),
  exceptions: many(eventExceptions),
  tags: many(eventTags),
  reminders: many(reminders),
}));

export const eventRecurrenceRelations = relations(eventRecurrence, ({ one }) => ({
  event: one(events, { fields: [eventRecurrence.eventId], references: [events.id] }),
}));

export const eventExceptionsRelations = relations(eventExceptions, ({ one }) => ({
  event: one(events, { fields: [eventExceptions.eventId], references: [events.id] }),
}));

export const eventTagsRelations = relations(eventTags, ({ one }) => ({
  event: one(events, { fields: [eventTags.eventId], references: [events.id] }),
  tag: one(tags, { fields: [eventTags.tagId], references: [tags.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
  category: one(categories, { fields: [tasks.categoryId], references: [categories.id] }),
  event: one(events, { fields: [tasks.eventId], references: [events.id] }),
  tags: many(taskTags),
  reminders: many(reminders),
}));

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, { fields: [taskTags.taskId], references: [tasks.id] }),
  tag: one(tags, { fields: [taskTags.tagId], references: [tags.id] }),
}));

export const specialDatesRelations = relations(specialDates, ({ one, many }) => ({
  user: one(users, { fields: [specialDates.userId], references: [users.id] }),
  reminders: many(reminders),
}));

export const remindersRelations = relations(reminders, ({ one, many }) => ({
  user: one(users, { fields: [reminders.userId], references: [users.id] }),
  event: one(events, { fields: [reminders.eventId], references: [events.id] }),
  task: one(tasks, { fields: [reminders.taskId], references: [tasks.id] }),
  specialDate: one(specialDates, { fields: [reminders.specialDateId], references: [specialDates.id] }),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  reminder: one(reminders, { fields: [notifications.reminderId], references: [reminders.id] }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, { fields: [apiTokens.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
  token: one(apiTokens, { fields: [auditLogs.apiTokenId], references: [apiTokens.id] }),
}));
