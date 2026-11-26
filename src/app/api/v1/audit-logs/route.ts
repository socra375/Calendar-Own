import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { paginated } from "@/server/http/response";
import { auditListQuery } from "@/lib/validation/audit-logs";
import { listAuditLogs } from "@/server/services/audit-logs.service";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ auth: "any", query: auditListQuery }, async (ctx) => {
  const r = await listAuditLogs(ctx, ctx.query);
  return paginated(r.items, { page: ctx.query.page, pageSize: ctx.query.pageSize, total: r.total });
});
