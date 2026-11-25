import { z } from "zod";
import { csv } from "./common";
import { eventOut } from "./events";
import { specialDateOut } from "./special-dates";
import { taskOut } from "./tasks";

export const SEARCH_TYPES = ["event", "task", "special_date"] as const;
export const searchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  types: csv(z.enum(SEARCH_TYPES)).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const searchOut = z.object({
  query: z.string(),
  events: z.array(eventOut),
  tasks: z.array(taskOut),
  specialDates: z.array(specialDateOut),
  totals: z.object({ events: z.number().int(), tasks: z.number().int(), specialDates: z.number().int() }),
});
