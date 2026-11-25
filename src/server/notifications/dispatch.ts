import { sendEmail, resolveEmailConfig } from "./channels/email";
import { sendInternal } from "./channels/internal";
import { resolveTelegramConfig, sendTelegram } from "./channels/telegram";
import type { ChannelMessage, ChannelName, Env, Transports } from "./channels/types";

export interface UserChannelSettings {
  telegramChatId?: string | null;
  notificationEmail?: string | null;
}

/** Entrega un mensaje por el canal. Lanza ChannelError si falla (incluye CHANNEL_NOT_CONFIGURED). */
export async function dispatch(
  channel: ChannelName,
  msg: ChannelMessage,
  settings: UserChannelSettings | null,
  env: Env,
  transports: Transports = {},
): Promise<void> {
  switch (channel) {
    case "internal":
      return sendInternal(msg);
    case "telegram":
      return sendTelegram(msg, resolveTelegramConfig(env, settings?.telegramChatId), transports);
    case "email":
      return sendEmail(msg, resolveEmailConfig(env, settings?.notificationEmail), transports);
  }
}
