import { z } from "zod";
import { csv, isoDateTime, pageQuery, queryBool, rangeBound, uuid } from "./common";

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;

const f = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable(),
  dueAt: isoDateTime.nullable(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  categoryId: uuid.nullable(),
  eventId: uuid.nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30),
};

export const taskCreateBody = z.object({
  title: f.title,
  description: f.description.optional(),
  dueAt: f.dueAt.optional(),
  priority: f.priority.default("medium"),
  status: f.status.default("pending"),
  categoryId: f.categoryId.optional(),
  eventId: f.eventId.optional(),
  tags: f.tags.optional(),
  reminders: z
    .array(
      z.object({
        offsetMinutes: z.number().int().min(0).max(60 * 24 * 365),
        channel: z.enum(["internal", "telegram", "email"]).default("internal"),
      }),
    )
    .max(10)
    .optional(),
});
export type TaskCreateBody = z.infer<typeof taskCreateBody>;

export const taskUpdateBody = z
  .object({
    title: f.title,
    description: f.description,
    dueAt: f.dueAt,
    priority: f.priority,
    status: f.status,
    categoryId: f.categoryId,
    eventId: f.eventId,
    tags: f.tags,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo");
export type TaskUpdateBody = z.infer<typeof taskUpdateBody>;

export const taskListQuery = pageQuery.extend({
  q: z.string().trim().max(200).optional(),
  status: csv(z.enum(TASK_STATUSES)).optional(),
  priority: csv(z.enum(TASK_PRIORITIES)).optional(),
  categoryId: uuid.optional(),
  eventId: uuid.optional(),
  tag: z.string().trim().max(50).optional(),
  from: rangeBound.optional().describe("Vence desde (inclusive)"),
  to: rangeBound.optional().describe("Vence hasta (exclusive; fecha = día inclusivo)"),
  overdue: queryBool.optional().describe("Pendientes/en progreso con fecha vencida"),
  sort: z.enum(["due", "-due", "priority", "-priority", "created", "-created", "title", "-title"]).default("due"),
  deleted: queryBool.optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuery>;

export const taskOut = z.object({
  id: uuid,
  title: z.string(),
  description: z.string().nullable(),
  dueAt: z.string().nullable().describe("ISO con offset en la zona del usuario"),
  dueLocalDate: z.string().nullable(),
  dueLocalTime: z.string().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  isOverdue: z.boolean(),
  categoryId: uuid.nullable(),
  category: z.object({ id: uuid, name: z.string(), color: z.string() }).nullable(),
  eventId: uuid.nullable(),
  event: z.object({ id: uuid, title: z.string() }).nullable(),
  completedAt: z.string().nullable(),
  source: z.enum(["ui", "eddie", "system"]),
  tags: z.array(z.object({ id: uuid, name: z.string(), color: z.string().nullable() })),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
