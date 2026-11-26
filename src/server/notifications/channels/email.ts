import { Resend } from "resend";
import { scrubSecrets } from "../scrub";
import { escapeHtml } from "./telegram";
import { ChannelError, type ChannelMessage, type Env, type ResendLike, type Transports } from "./types";

export function resolveEmailConfig(env: Env, userEmail: string | null | undefined) {
  return {
    apiKey: env.RESEND_API_KEY || undefined,
    from: env.EMAIL_FROM || undefined,
    to: userEmail || env.NOTIFICATION_EMAIL_TO || undefined,
  };
}

/** Plantilla HTML sobria (sin imágenes remotas ni scripts). */
export function renderEmail(msg: ChannelMessage): { subject: string; html: string; text: string } {
  const body = msg.body ? escapeHtml(msg.body).replace(/\n/g, "<br>") : "";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:8px"><tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#78716c">Personal Calendar</p>
<h1 style="margin:0 0 12px;font-size:18px;line-height:1.3">${escapeHtml(msg.title)}</h1>
${body ? `<p style="margin:0;font-size:15px;line-height:1.5">${body}</p>` : ""}
</td></tr></table></body></html>`;
  return { subject: msg.title, html, text: msg.body ? `${msg.title}\n\n${msg.body}` : msg.title };
}

export async function sendEmail(
  msg: ChannelMessage,
  cfg: { apiKey?: string; from?: string; to?: string },
  transports: Transports = {},
): Promise<void> {
  await deliverEmail(renderEmail(msg), cfg, transports);
}

/** Envío de bajo nivel por Resend de un correo ya renderizado (lo reutilizan otros flujos, p. ej. recuperar contraseña). */
export async function deliverEmail(
  mail: { subject: string; html: string; text: string },
  cfg: { apiKey?: string; from?: string; to?: string },
  transports: Transports = {},
): Promise<void> {
  if (!cfg.apiKey || !cfg.from || !cfg.to) {
    throw new ChannelError(
      "CHANNEL_NOT_CONFIGURED",
      "Email no configurado: falta RESEND_API_KEY, EMAIL_FROM o destinatario (user_settings.notification_email / NOTIFICATION_EMAIL_TO)",
    );
  }
  const client: ResendLike = transports.resend ? transports.resend(cfg.apiKey) : (new Resend(cfg.apiKey) as unknown as ResendLike);
  const { subject, html, text } = mail;
  let result: Awaited<ReturnType<ResendLike["emails"]["send"]>>;
  try {
    result = await client.emails.send({ from: cfg.from, to: cfg.to, subject, html, text });
  } catch (e) {
    throw new ChannelError("CHANNEL_TRANSIENT", `Resend inaccesible: ${scrubSecrets(String((e as Error)?.message ?? e), [cfg.apiKey])}`);
  }
  if (!result.error) return;
  const status = result.error.statusCode ?? 0;
  const desc = scrubSecrets(`${result.error.name ?? "error"}: ${result.error.message}`, [cfg.apiKey]);
  if (status === 429) throw new ChannelError("CHANNEL_RATE_LIMITED", `Resend 429: ${desc}`, { retryAfterSeconds: 60 });
  if (status >= 400 && status < 500) throw new ChannelError("CHANNEL_REJECTED", `Resend ${status}: ${desc}`);
  throw new ChannelError("CHANNEL_TRANSIENT", `Resend ${status || "?"}: ${desc}`);
}
