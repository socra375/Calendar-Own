export function getIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent")?.slice(0, 300) ?? null;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
