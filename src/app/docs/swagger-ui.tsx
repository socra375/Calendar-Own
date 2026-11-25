"use client";
import { useEffect, useRef, useState } from "react";

const VERSION = "5.17.14"; // versión fija de swagger-ui-dist
const BASE = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${VERSION}`;

declare global {
  interface Window {
    SwaggerUIBundle?: (config: Record<string, unknown>) => unknown;
  }
}

function load(tag: "link" | "script", url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    if (el instanceof HTMLLinkElement) {
      el.rel = "stylesheet";
      el.href = url;
    } else if (el instanceof HTMLScriptElement) {
      el.src = url;
      el.async = true;
    }
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    document.head.appendChild(el);
  });
}

/** Swagger UI cargado desde CDN (jsdelivr, versión fija) sobre /api/v1/openapi.json. */
export function SwaggerUI({ specUrl }: { specUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([load("link", `${BASE}/swagger-ui.css`), load("script", `${BASE}/swagger-ui-bundle.js`)]);
        if (cancelled || !window.SwaggerUIBundle || !ref.current) return;
        window.SwaggerUIBundle({
          url: specUrl,
          domNode: ref.current,
          deepLinking: true,
          docExpansion: "list",
          defaultModelsExpandDepth: 0,
          tryItOutEnabled: true,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [specUrl]);

  return (
    <div style={{ background: "#fff", minHeight: "100vh", color: "#111" }}>
      {error ? (
        <p style={{ padding: 24 }}>
          {error}. Puedes consultar la especificación directamente en <a href={specUrl}>{specUrl}</a>.
        </p>
      ) : null}
      <div ref={ref} />
    </div>
  );
}
