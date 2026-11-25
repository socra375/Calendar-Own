import type { ChannelMessage } from "./types";

/**
 * Canal interno: la propia fila de `notifications` ES la bandeja, así que "enviar" no requiere
 * trabajo externo; el procesador la marca `sent`. Existe para mantener la interfaz uniforme.
 */
export async function sendInternal(msg: ChannelMessage): Promise<void> {
  void msg;
  /* nada que entregar: la bandeja se lee desde la BD */
}
