import { scrubSecrets } from "../scrub";
import { ChannelError, type ChannelMessage, type Env, type Transports } from "./types";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function resolveTelegramConfig(env: Env, userChatId: string | null | undefined) {
  const token = env.TELEGRAM_BOT_TOKEN || undefined;
  const chatId = userChatId || env.TELEGRAM_CHAT_ID || undefined;
  return { token, chatId };
}

/** Envía por la Bot API de Telegram (fetch). Lanza ChannelError tipado; nunca simula el envío. */
export async function sendTelegram(
  msg: ChannelMessage,
  cfg: { token?: string; chatId?: string },
  transports: Transports = {},
): Promise<void> {
  if (!cfg.token || !cfg.chatId) {
    throw new ChannelError(
      "CHANNEL_NOT_CONFIGURED",
      "Telegram no configurado: falta TELEGRAM_BOT_TOKEN o chat_id (user_settings.telegram_chat_id / TELEGRAM_CHAT_ID)",
    );
  }
  const f = transports.fetch ?? fetch;
  const base = (transports.telegramBaseUrl ?? "https://api.telegram.org").replace(/\/+$/, "");
  const text = `<b>${escapeHtml(msg.title)}</b>${msg.body ? `\n${escapeHtml(msg.body)}` : ""}`;
  let res: Response;
  try {
    res = await f(`${base}/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    // El mensaje de error de fetch puede incluir la URL (con el token): se limpia.
    throw new ChannelError("CHANNEL_TRANSIENT", `Telegram inaccesible: ${scrubSecrets(String((e as Error)?.message ?? e), [cfg.token])}`);
  }
  let payload: { ok?: boolean; description?: string; parameters?: { retry_after?: number } } = {};
  try {
    payload = await res.json();
  } catch {
    /* cuerpo no JSON */
  }
  if (res.ok && payload.ok !== false) return;
  const desc = scrubSecrets(payload.description ?? res.statusText ?? "error", [cfg.token]);
  if (res.status === 429) {
    throw new ChannelError("CHANNEL_RATE_LIMITED", `Telegram 429: ${desc}`, {
      retryAfterSeconds: payload.parameters?.retry_after ?? (Number(res.headers.get("retry-after")) || 30),
    });
  }
  if (res.status >= 400 && res.status < 500) throw new ChannelError("CHANNEL_REJECTED", `Telegram ${res.status}: ${desc}`);
  throw new ChannelError("CHANNEL_TRANSIENT", `Telegram ${res.status}: ${desc}`);
}
