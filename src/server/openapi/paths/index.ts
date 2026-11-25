import { buildOpenApi } from "../registry";
import { eventOps } from "./events";
import { miscOps } from "./misc";
import { notificationOps } from "./notifications";
import { resourceOps } from "./resources";

export const allOps = [...eventOps, ...resourceOps, ...notificationOps, ...miscOps];

let cached: ReturnType<typeof buildOpenApi> | undefined;
export function getOpenApiDocument() {
  return (cached ??= buildOpenApi(allOps));
}
