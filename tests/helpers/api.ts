import * as eventsRoute from "@/app/api/v1/events/route";
import * as eventRoute from "@/app/api/v1/events/[id]/route";
import * as eventDup from "@/app/api/v1/events/[id]/duplicate/route";
import * as eventRestore from "@/app/api/v1/events/[id]/restore/route";
import * as availability from "@/app/api/v1/availability/route";
import * as freeSlots from "@/app/api/v1/availability/free-slots/route";
import * as tasksRoute from "@/app/api/v1/tasks/route";
import * as taskRoute from "@/app/api/v1/tasks/[id]/route";
import * as taskRestore from "@/app/api/v1/tasks/[id]/restore/route";
import * as categoriesRoute from "@/app/api/v1/categories/route";
import * as categoryRoute from "@/app/api/v1/categories/[id]/route";
import * as categoryRestore from "@/app/api/v1/categories/[id]/restore/route";
import * as tagsRoute from "@/app/api/v1/tags/route";
import * as tagRoute from "@/app/api/v1/tags/[id]/route";
import * as sdRoute from "@/app/api/v1/special-dates/route";
import * as sdItem from "@/app/api/v1/special-dates/[id]/route";
import * as sdRestore from "@/app/api/v1/special-dates/[id]/restore/route";
import * as remindersRoute from "@/app/api/v1/reminders/route";
import * as reminderRoute from "@/app/api/v1/reminders/[id]/route";
import * as dashboardRoute from "@/app/api/v1/dashboard/route";
import * as agendaRoute from "@/app/api/v1/agenda/route";
import * as searchRoute from "@/app/api/v1/search/route";
import * as settingsRoute from "@/app/api/v1/settings/route";
import * as tokensRoute from "@/app/api/v1/tokens/route";
import * as tokenRoute from "@/app/api/v1/tokens/[id]/route";
import * as tokenRotate from "@/app/api/v1/tokens/[id]/rotate/route";
import * as auditRoute from "@/app/api/v1/audit-logs/route";
import { call, type CallOptions } from "./index";

export const routes = {
  eventsRoute, eventRoute, eventDup, eventRestore, availability, freeSlots, tasksRoute, taskRoute, taskRestore,
  categoriesRoute, categoryRoute, categoryRestore, tagsRoute, tagRoute, sdRoute, sdItem, sdRestore,
  remindersRoute, reminderRoute, dashboardRoute, agendaRoute, searchRoute, settingsRoute, tokensRoute,
  tokenRoute, tokenRotate, auditRoute,
};

type Auth = { token?: string; cookie?: string };
type Opts = Omit<CallOptions, "token" | "cookie" | "method" | "params" | "body" | "query">;

/** Cliente de pruebas sobre los route handlers reales. */
export function api(auth: Auth) {
  const r = routes;
  const c = (h: any, path: string, method: string, extra: CallOptions & Opts = {}) =>
    call(h, `/api/v1${path}`, { ...auth, method, ...extra });
  return {
    // events
    listEvents: (query?: CallOptions["query"]) => c(r.eventsRoute.GET, "/events", "GET", { query }),
    createEvent: (body: unknown) => c(r.eventsRoute.POST, "/events", "POST", { body }),
    bulkDelete: (ids: string[], headers?: Record<string, string>) => c(r.eventsRoute.DELETE, "/events", "DELETE", { query: { ids: ids.join(",") }, headers }),
    getEvent: (id: string) => c(r.eventRoute.GET, `/events/${id}`, "GET", { params: { id } }),
    patchEvent: (id: string, body: unknown, query?: CallOptions["query"]) => c(r.eventRoute.PATCH, `/events/${id}`, "PATCH", { params: { id }, body, query }),
    deleteEvent: (id: string, query?: CallOptions["query"]) => c(r.eventRoute.DELETE, `/events/${id}`, "DELETE", { params: { id }, query }),
    duplicateEvent: (id: string, body: unknown = {}) => c(r.eventDup.POST, `/events/${id}/duplicate`, "POST", { params: { id }, body }),
    restoreEvent: (id: string) => c(r.eventRestore.POST, `/events/${id}/restore`, "POST", { params: { id } }),
    availability: (query: CallOptions["query"]) => c(r.availability.GET, "/availability", "GET", { query }),
    freeSlots: (query: CallOptions["query"]) => c(r.freeSlots.GET, "/availability/free-slots", "GET", { query }),
    // tasks
    listTasks: (query?: CallOptions["query"]) => c(r.tasksRoute.GET, "/tasks", "GET", { query }),
    createTask: (body: unknown) => c(r.tasksRoute.POST, "/tasks", "POST", { body }),
    getTask: (id: string) => c(r.taskRoute.GET, `/tasks/${id}`, "GET", { params: { id } }),
    patchTask: (id: string, body: unknown) => c(r.taskRoute.PATCH, `/tasks/${id}`, "PATCH", { params: { id }, body }),
    deleteTask: (id: string) => c(r.taskRoute.DELETE, `/tasks/${id}`, "DELETE", { params: { id } }),
    restoreTask: (id: string) => c(r.taskRestore.POST, `/tasks/${id}/restore`, "POST", { params: { id } }),
    // categories
    listCategories: (query?: CallOptions["query"]) => c(r.categoriesRoute.GET, "/categories", "GET", { query }),
    createCategory: (body: unknown) => c(r.categoriesRoute.POST, "/categories", "POST", { body }),
    getCategory: (id: string) => c(r.categoryRoute.GET, `/categories/${id}`, "GET", { params: { id } }),
    patchCategory: (id: string, body: unknown) => c(r.categoryRoute.PATCH, `/categories/${id}`, "PATCH", { params: { id }, body }),
    deleteCategory: (id: string) => c(r.categoryRoute.DELETE, `/categories/${id}`, "DELETE", { params: { id } }),
    restoreCategory: (id: string) => c(r.categoryRestore.POST, `/categories/${id}/restore`, "POST", { params: { id } }),
    // tags
    listTags: (query?: CallOptions["query"]) => c(r.tagsRoute.GET, "/tags", "GET", { query }),
    createTag: (body: unknown) => c(r.tagsRoute.POST, "/tags", "POST", { body }),
    patchTag: (id: string, body: unknown) => c(r.tagRoute.PATCH, `/tags/${id}`, "PATCH", { params: { id }, body }),
    deleteTag: (id: string) => c(r.tagRoute.DELETE, `/tags/${id}`, "DELETE", { params: { id } }),
    // special dates
    listSd: (query?: CallOptions["query"]) => c(r.sdRoute.GET, "/special-dates", "GET", { query }),
    createSd: (body: unknown) => c(r.sdRoute.POST, "/special-dates", "POST", { body }),
    getSd: (id: string) => c(r.sdItem.GET, `/special-dates/${id}`, "GET", { params: { id } }),
    patchSd: (id: string, body: unknown) => c(r.sdItem.PATCH, `/special-dates/${id}`, "PATCH", { params: { id }, body }),
    deleteSd: (id: string) => c(r.sdItem.DELETE, `/special-dates/${id}`, "DELETE", { params: { id } }),
    restoreSd: (id: string) => c(r.sdRestore.POST, `/special-dates/${id}/restore`, "POST", { params: { id } }),
    // reminders
    listReminders: (query?: CallOptions["query"]) => c(r.remindersRoute.GET, "/reminders", "GET", { query }),
    createReminder: (body: unknown) => c(r.remindersRoute.POST, "/reminders", "POST", { body }),
    patchReminder: (id: string, body: unknown) => c(r.reminderRoute.PATCH, `/reminders/${id}`, "PATCH", { params: { id }, body }),
    deleteReminder: (id: string) => c(r.reminderRoute.DELETE, `/reminders/${id}`, "DELETE", { params: { id } }),
    // misc
    dashboard: () => c(r.dashboardRoute.GET, "/dashboard", "GET"),
    agenda: (query?: CallOptions["query"]) => c(r.agendaRoute.GET, "/agenda", "GET", { query }),
    search: (query: CallOptions["query"]) => c(r.searchRoute.GET, "/search", "GET", { query }),
    getSettings: () => c(r.settingsRoute.GET, "/settings", "GET"),
    patchSettings: (body: unknown) => c(r.settingsRoute.PATCH, "/settings", "PATCH", { body }),
    listTokens: () => c(r.tokensRoute.GET, "/tokens", "GET"),
    createToken: (body: unknown) => c(r.tokensRoute.POST, "/tokens", "POST", { body }),
    rotateToken: (id: string) => c(r.tokenRotate.POST, `/tokens/${id}/rotate`, "POST", { params: { id } }),
    revokeToken: (id: string) => c(r.tokenRoute.DELETE, `/tokens/${id}`, "DELETE", { params: { id } }),
    auditLogs: (query?: CallOptions["query"]) => c(r.auditRoute.GET, "/audit-logs", "GET", { query }),
  };
}

/** Hora local de Santo Domingo (UTC-4 fijo) → ISO con offset. */
export const sd = (date: string, hm: string) => `${date}T${hm}:00-04:00`;
