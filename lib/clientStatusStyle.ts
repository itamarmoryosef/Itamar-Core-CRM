/**
 * Badge styling for `client_statuses.color_hex` (hex #RRGGBB).
 */

export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex?.trim() ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Relative luminance (sRGB), WCAG-style approximation. */
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(rgb.r);
  const g = lin(rgb.g);
  const b = lin(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastingForegroundForBg(hex: string): "#0f172a" | "#ffffff" {
  const rgb = parseHexColor(hex);
  if (!rgb) return "#0f172a";
  return relativeLuminance(rgb) > 0.45 ? "#0f172a" : "#ffffff";
}

export function clientStatusBadgeStyle(hex: string): {
  backgroundColor: string;
  color: string;
} {
  const bg = parseHexColor(hex) ? hex.trim() : "#64748b";
  return {
    backgroundColor: bg,
    color: contrastingForegroundForBg(bg),
  };
}
