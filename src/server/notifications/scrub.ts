/** Elimina secretos de textos de error antes de guardarlos (last_error, audit) o devolverlos. */
const PATTERNS: RegExp[] = [
  /bot\d{5,}:[A-Za-z0-9_-]{20,}/g, // token de bot de Telegram (aparece en la URL)
  /\bre_[A-Za-z0-9_]{10,}/g, // API key de Resend
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
];

export function scrubSecrets(text: string, secrets: Array<string | undefined | null> = []): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join("[REDACTED]");
  }
  for (const re of PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.length > 500 ? out.slice(0, 500) + "…" : out;
}
