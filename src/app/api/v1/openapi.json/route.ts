import { apiHandler } from "@/server/http/handler";
import { preflight } from "@/server/http/cors";
import { getOpenApiDocument } from "@/server/openapi/paths";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// Documento OpenAPI 3.1 generado desde los schemas Zod. Público, sin envelope.
export const GET = apiHandler({ auth: "public" }, async () => Response.json(getOpenApiDocument()));
