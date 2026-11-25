/** Color de texto (claro/oscuro) con contraste WCAG >= 4.5 sobre un fondo hex. */
function lin(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
export function luminance(hex: string) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}
export function readableOn(hex: string): string {
  const L = luminance(hex);
  const withWhite = 1.05 / (L + 0.05);
  const withBlack = (L + 0.05) / 0.05;
  return withWhite >= withBlack ? "#ffffff" : "#1f1a17";
}

export const PALETTE = [
  "#e8590c", "#be3f0a", "#d97706", "#f2b84b", "#8a9a3b", "#2f7d4f",
  "#0f766e", "#6d5ba6", "#b83a6a", "#a14a2f", "#7a5c3e", "#5f6b73",
];
