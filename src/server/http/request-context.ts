import { AsyncLocalStorage } from "node:async_hooks";

/** Propaga el requestId para que ok()/fail() lo incluyan sin pasarlo a mano. */
export const requestStore = new AsyncLocalStorage<{ requestId: string }>();

export function currentRequestId(): string | undefined {
  return requestStore.getStore()?.requestId;
}
