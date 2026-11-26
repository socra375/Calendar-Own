import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allOps, getOpenApiDocument } from "@/server/openapi/paths";

const API_ROOT = path.resolve(process.cwd(), "src/app/api/v1");

function routeFiles(dir: string, base = ""): { urlPath: string; file: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full, `${base}/${name.replace(/^\[(.+)\]$/, "{$1}")}`);
    return name === "route.ts" ? [{ urlPath: base, file: full }] : [];
  });
}

const EXCLUDED = new Set(["/health"]);

describe("OpenAPI", () => {
  const doc = getOpenApiDocument() as any;

  it("documenta cada ruta y método de /api/v1 (salvo health)", () => {
    for (const { urlPath, file } of routeFiles(API_ROOT)) {
      if (EXCLUDED.has(urlPath)) continue;
      const src = readFileSync(file, "utf8");
      const methods = [...src.matchAll(/export const (GET|POST|PATCH|PUT|DELETE) /g)].map((m) => m[1]!.toLowerCase());
      expect(methods.length, urlPath).toBeGreaterThan(0);
      for (const m of methods) expect(doc.paths[urlPath]?.[m], `${m.toUpperCase()} ${urlPath} sin documentar`).toBeTruthy();
    }
    // y nada documentado sin ruta
    const real = new Set(routeFiles(API_ROOT).map((r) => r.urlPath));
    for (const p of Object.keys(doc.paths)) expect(real.has(p), `documentado sin ruta: ${p}`).toBe(true);
  });

  it("estructura OpenAPI 3.1 con seguridad bearer + cookie", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(doc.components.securitySchemes.cookieAuth).toMatchObject({ type: "apiKey", in: "cookie", name: "pc_session" });
    expect(doc.paths["/tokens"].get.security).toEqual([{ cookieAuth: [] }]);
    expect(doc.paths["/openapi.json"].get.security).toEqual([]);
    expect(doc.paths["/events"].get.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
  });

  it("cada operación tiene ejemplo de respuesta y, si tiene cuerpo, ejemplo de petición", () => {
    for (const [p, item] of Object.entries<any>(doc.paths)) {
      for (const [m, op] of Object.entries<any>(item)) {
        const ok = Object.entries<any>(op.responses).find(([c]) => c.startsWith("2"))![1];
        expect(ok.content["application/json"].example, `${m} ${p} ejemplo respuesta`).toBeTruthy();
        expect(op.responses["401"] !== undefined || op.security.length === 0, `${m} ${p} 401`).toBe(true);
        if (op.requestBody) expect(op.requestBody.content["application/json"].example, `${m} ${p} ejemplo petición`).toBeTruthy();
      }
    }
  });

  it("los ejemplos de petición validan contra su propio schema Zod", () => {
    for (const op of allOps) {
      if (!op.body || op.requestExample === undefined) continue;
      const r = op.body.safeParse(op.requestExample);
      expect(r.success, `${op.method} ${op.path}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it("los ejemplos de respuesta validan contra el schema de salida", () => {
    for (const op of allOps) {
      const sample = op.paginated ? (op.responseExample as unknown[])[0] : op.responseExample;
      const r = op.response.safeParse(sample);
      expect(r.success, `${op.method} ${op.path}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it("los query params exponen paginación page/pageSize<=100", () => {
    const params = doc.paths["/events"].get.parameters as any[];
    const pageSize = params.find((p) => p.name === "pageSize");
    expect(pageSize.schema.maximum).toBe(100);
    expect(params.find((p) => p.name === "from")).toBeTruthy();
    expect(doc.paths["/events"].delete.parameters.some((p: any) => p.in === "header" && p.name === "X-Confirm-Bulk")).toBe(true);
  });
});
