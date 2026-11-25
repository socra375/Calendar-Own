import "server-only";
import { db as defaultDb, type DbOrTx } from "../db/client";
import { auditLogs } from "../db/schema";

const SENSITIVE = /(pass(word|wd)?|token|secret|authorization|cookie|api[-_]?key|hash|credential)/i;

/** Redacta recursivamente claves sensibles; convierte Date a ISO; limita profundidad. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return "[TRUNCATED]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 2000) return value.slice(0, 2000) + "…";
  return value;
}

export interface AuditActor {
  userId?: string | null;
  type: "user" | "eddie" | "system";
  tokenId?: string;
}

/** Acepta el ctx de apiHandler o un actor suelto (con requestId/ip/userAgent opcionales). */
export type AuditSource =
  | { actor: AuditActor | null; requestId?: string; ip?: string | null; userAgent?: string | null }
  | (AuditActor & { requestId?: string; ip?: string | null; userAgent?: string | null });

export interface AuditEntry {
  action: string; // p. ej. "event.create"
  resourceType?: string;
  resourceId?: string;
  result?: "success" | "failure";
  changes?: unknown;
}

function isCtx(s: AuditSource): s is Extract<AuditSource, { actor: AuditActor | null }> {
  return "actor" in s;
}

/**
 * Registra una entrada de auditoría. Nunca lanza (un fallo de auditoría no debe romper la operación);
 * pásale `tx` para escribir dentro de la misma transacción.
 */
export async function audit(source: AuditSource, entry: AuditEntry, tx: DbOrTx = defaultDb): Promise<void> {
  try {
    const actor: AuditActor = isCtx(source) ? (source.actor ?? { type: "system" }) : source;
    await tx.insert(auditLogs).values({
      userId: actor.userId ?? null,
      actorType: actor.type,
      apiTokenId: actor.tokenId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      requestId: source.requestId ?? null,
      result: entry.result ?? "success",
      changes: entry.changes === undefined ? null : redact(entry.changes),
      ip: source.ip ?? null,
      userAgent: source.userAgent ?? null,
    });
  } catch (e) {
    console.error("[audit] no se pudo registrar", entry.action, e);
  }
}
