// Registro seguro de errores: nunca imprime el objeto de error crudo (los errores de Drizzle/pg arrastran los
// parámetros de la consulta SQL —emails, hashes, tokens— en `message`, `cause` y propiedades como `detail`).
// Solo se registra: nombre, mensaje truncado y sin la parte "params: …", y el código (p. ej. SQLSTATE de pg).

const MAX_MESSAGE = 300;

function codeOf(err: unknown): string | undefined {
  const pick = (e: unknown) => {
    const c = (e as { code?: unknown } | null)?.code;
    return typeof c === "string" || typeof c === "number" ? String(c) : undefined;
  };
  return pick(err) ?? pick((err as { cause?: unknown } | null)?.cause);
}

/** Texto seguro y de una sola línea que describe el error (sin parámetros SQL). */
export function describeError(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  let message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  message = message.replace(/\s*params:[\s\S]*$/i, "").replace(/\s+/g, " ").trim();
  if (message.length > MAX_MESSAGE) message = `${message.slice(0, MAX_MESSAGE)}…`;
  const code = codeOf(err);
  return `${name}${code ? ` [code=${code}]` : ""}${message ? `: ${message}` : ""}`;
}

/** console.error de un error sin datos sensibles. `context` es un texto fijo escrito por el desarrollador. */
export function safeErrorLog(err: unknown, context?: string): void {
  console.error(context ? `${context} ${describeError(err)}` : describeError(err));
}
