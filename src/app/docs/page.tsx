import type { Metadata } from "next";
import { SwaggerUI } from "./swagger-ui";

export const metadata: Metadata = { title: "API · Personal Calendar" };

export default function DocsPage() {
  return <SwaggerUI specUrl="/api/v1/openapi.json" />;
}
