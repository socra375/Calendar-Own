export type Provider = "google_meet" | "zoom" | "teams" | "other";
export const PROVIDER_LABEL: Record<Provider, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  other: "Otra videollamada",
};
export function detectProvider(url: string): Provider | null {
  const t = url.trim();
  if (!t) return null;
  try {
    const host = new URL(t).hostname.toLowerCase();
    if (host === "meet.google.com") return "google_meet";
    if (host === "zoom.us" || host.endsWith(".zoom.us")) return "zoom";
    if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "teams";
    return "other";
  } catch {
    return null;
  }
}
