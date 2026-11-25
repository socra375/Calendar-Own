import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const csp = [
  "default-src 'self'",
  // Next necesita inline para hidratación; Swagger UI (/docs) usa CDN de jsdelivr/unpkg.
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://cdn.jsdelivr.net https://unpkg.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
  "img-src 'self' data: blob: https://cdn.jsdelivr.net https://unpkg.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pg", "@node-rs/argon2"],
  async headers() {
    // Las páginas de recuperación llevan el token en la URL: sin Referer para no filtrarlo (la última regla gana).
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/forgot-password", headers: noReferrer },
      { source: "/reset-password", headers: noReferrer },
    ];
  },
};

export default nextConfig;
