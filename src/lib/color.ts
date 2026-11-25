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
  return withWhite >= withBlack ? "#ffffff" : "#0b0d0e";
}

export const PALETTE = [
  "#2dd4bf", "#0f9488", "#2563eb", "#7c3aed", "#db2777", "#dc2626",
  "#d97706", "#f5b84b", "#059669", "#6ee7a8", "#64748b", "#a855f7",
];
