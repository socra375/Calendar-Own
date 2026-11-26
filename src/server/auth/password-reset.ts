import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { newPasswordSchema } from "@/lib/validation/auth";
import { audit, type AuditSource } from "../audit/audit.service";
import { db } from "../db/client";
import { passwordResetTokens, users } from "../db/schema";
import { AppError, ValidationError } from "../http/errors";
import { deliverEmail } from "../notifications/channels/email";
import { ChannelError, type Env, type Transports } from "../notifications/channels/types";
import { scrubSecrets } from "../notifications/scrub";
import { safeErrorLog } from "../safe-log";
import { hashPassword } from "./password";
import { destroyAllSessions } from "./session";
import { escapeHtml } from "../notifications/channels/telegram";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
export const INVALID_TOKEN_MESSAGE = "El enlace no es válido o ha caducado. Solicita uno nuevo.";

export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface ResetContext {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string;
  /** Por defecto process.env. Inyectable en tests. */
  env?: Env;
  /** Transporte de Resend inyectable (tests). */
  transports?: Transports;
  now?: Date;
  /**
   * Cómo ejecutar el envío del correo. Por defecto se espera (await). El route handler lo desacopla de la respuesta
   * para que existir o no el correo no cambie la latencia percibida.
   */
  defer?: (job: () => Promise<void>) => void;
}

/** Plantilla HTML sobria en español (sin imágenes remotas ni scripts). */
export function renderResetEmail(link: string): { subject: string; html: string; text: string } {
  const safe = escapeHtml(link);
  const subject = "Restablece tu contraseña · Personal Calendar";
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:8px"><tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#78716c">Personal Calendar</p>
<h1 style="margin:0 0 12px;font-size:18px;line-height:1.3">Restablece tu contraseña</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Recibimos una solicitud para cambiar la contraseña de tu cuenta. Pulsa el botón para elegir una nueva. El enlace caduca en 1 hora y solo puede usarse una vez.</p>
<p style="margin:0 0 20px"><a href="${safe}" style="display:inline-block;padding:10px 18px;background:#BE3F0A;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">Cambiar contraseña</a></p>
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#57534e">Si el botón no funciona, copia y pega esta dirección en tu navegador:</p>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;word-break:break-all;color:#57534e">${safe}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#57534e">Si no solicitaste este cambio, ignora este correo: tu contraseña no se modificará.</p>
</td></tr></table></body></html>`;
  const text = `Restablece tu contraseña\n\nRecibimos una solicitud para cambiar la contraseña de tu cuenta. Abre este enlace para elegir una nueva (caduca en 1 hora y solo puede usarse una vez):\n\n${link}\n\nSi no solicitaste este cambio, ignora este correo: tu contraseña no se modificará.`;
  return { subject, html, text };
}

function src(ctx: ResetContext, userId: string | null, type: "user" | "system" = "user"): AuditSource {
  return { actor: { type, userId }, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent };
}

/**
 * Solicita un enlace de recuperación. NUNCA revela si el correo existe: el llamador responde siempre lo mismo.
 * Sin Resend configurado no simula el envío: audita `auth.password_reset_email_failed` (CHANNEL_NOT_CONFIGURED).
 */
export async function requestPasswordReset(email: string, ctx: ResetContext = {}): Promise<void> {
  const env = ctx.env ?? process.env;
  const now = ctx.now ?? new Date();
  const normalized = email.trim().toLowerCase();

  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${normalized}`).limit(1);
  if (!user) {
    await audit(src(ctx, null, "system"), {
      action: "auth.password_reset_requested",
      resourceType: "password_reset",
      result: "failure",
      changes: { reason: "unknown_email" },
    });
    return;
  }

  const appUrl = env.APP_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.RESEND_API_KEY || undefined;
  const from = env.EMAIL_FROM || undefined;
  const failEmail = (reason: string, message: string) =>
    audit(src(ctx, user.id, "system"), {
      action: "auth.password_reset_email_failed",
      resourceType: "password_reset",
      result: "failure",
      changes: { reason, message: scrubSecrets(message, [apiKey]) },
    });

  // Sin APP_URL o sin Resend no se genera token ni se simula el envío.
  if (!appUrl) {
    await failEmail("APP_URL_NOT_CONFIGURED", "Falta APP_URL: no se puede construir el enlace de recuperación");
    return;
  }
  if (!apiKey || !from) {
    await failEmail("CHANNEL_NOT_CONFIGURED", "Email no configurado: falta RESEND_API_KEY o EMAIL_FROM");
    return;
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
  const [row] = await db.transaction(async (tx) => {
    // Un pedido nuevo invalida los anteriores no usados.
    await tx
      .update(passwordResetTokens)
      .set({ expiresAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      );
    return tx
      .insert(passwordResetTokens)
      .values({ userId: user.id, tokenHash: hashResetToken(token), expiresAt, requestedIp: ctx.ip ?? null })
      .returning({ id: passwordResetTokens.id });
  });
  const tokenRowId = row!.id;

  await audit(src(ctx, user.id), {
    action: "auth.password_reset_requested",
    resourceType: "password_reset",
    resourceId: tokenRowId,
    changes: { expiresAt },
  });

  const job = async () => {
    try {
      const mail = renderResetEmail(`${appUrl}/reset-password?token=${token}`);
      await deliverEmail(mail, { apiKey, from, to: user.email }, ctx.transports);
    } catch (e) {
      // El enlace nunca llegó: se invalida para no dejar un token vivo sin entregar.
      await db
        .update(passwordResetTokens)
        .set({ expiresAt: new Date() })
        .where(eq(passwordResetTokens.id, tokenRowId))
        .catch(() => undefined);
      if (e instanceof ChannelError) {
        await failEmail(e.code, e.message);
      } else {
        safeErrorLog(e, "[password-reset] error inesperado enviando correo");
        await failEmail("UNEXPECTED", "Error inesperado al enviar el correo");
      }
    }
  };
  if (ctx.defer) ctx.defer(job);
  else await job();
}

/** Canjea el token (uso único) y cambia la contraseña. Destruye todas las sesiones del usuario. */
export async function resetPassword(token: string, newPassword: string, ctx: ResetContext = {}): Promise<{ userId: string }> {
  const policy = newPasswordSchema.safeParse(newPassword);
  if (!policy.success) {
    throw new ValidationError("Contraseña inválida", policy.error.issues.map((i) => ({ path: "password", code: i.code, message: i.message })));
  }
  const now = ctx.now ?? new Date();
  // Se calcula antes de tocar el token: así un token inválido cuesta lo mismo que uno válido.
  const passwordHash = await hashPassword(newPassword);

  const claimed = await db.transaction(async (tx) => {
    // Canje atómico: solo una petición puede marcar used_at (uso único, seguro bajo concurrencia).
    const [t] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashResetToken(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning({ id: passwordResetTokens.id, userId: passwordResetTokens.userId });
    if (!t) return null;
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, t.userId));
    await destroyAllSessions(t.userId, tx);
    // Cualquier otro enlace pendiente del usuario deja de valer.
    await tx
      .update(passwordResetTokens)
      .set({ expiresAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, t.userId),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      );
    return t;
  });

  if (!claimed) {
    await audit(src(ctx, null, "system"), {
      action: "auth.password_reset_failed",
      resourceType: "password_reset",
      result: "failure",
      changes: { reason: "invalid_or_expired_token" },
    });
    throw new AppError("INVALID_OR_EXPIRED_TOKEN", 400, INVALID_TOKEN_MESSAGE);
  }

  await audit(src(ctx, claimed.userId), {
    action: "auth.password_reset_completed",
    resourceType: "password_reset",
    resourceId: claimed.id,
  });
  return { userId: claimed.userId };
}
