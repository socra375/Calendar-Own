export type ChannelName = "internal" | "telegram" | "email";

export interface ChannelMessage {
  notificationId: string;
  title: string;
  body: string | null;
}

/** Subconjunto de la API de Resend que usamos (permite inyectar un stub en tests). */
export interface ResendLike {
  emails: {
    send(payload: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      text: string;
    }): Promise<{
      data: { id: string } | null;
      error: { name?: string; message: string; statusCode?: number | null } | null;
    }>;
  };
}

/** Transportes inyectables: permiten probar con un servidor HTTP falso o stubs, sin red real. */
export interface Transports {
  fetch?: typeof fetch;
  /** Por defecto https://api.telegram.org */
  telegramBaseUrl?: string;
  resend?: (apiKey: string) => ResendLike;
}

export type Env = Record<string, string | undefined>;

export type ChannelErrorCode =
  | "CHANNEL_NOT_CONFIGURED"
  | "CHANNEL_REJECTED" // 4xx permanente (chat inexistente, destinatario inválido…)
  | "CHANNEL_RATE_LIMITED"
  | "CHANNEL_TRANSIENT"; // red / 5xx: se reintenta

export class ChannelError extends Error {
  constructor(
    public readonly code: ChannelErrorCode,
    message: string,
    public readonly opts: { retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "ChannelError";
  }
  /** Los errores permanentes no se reintentan. */
  get permanent() {
    return this.code === "CHANNEL_NOT_CONFIGURED" || this.code === "CHANNEL_REJECTED";
  }
}
