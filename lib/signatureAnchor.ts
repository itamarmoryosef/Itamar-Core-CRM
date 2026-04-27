/**
 * Normalized signature placement on a PDF page (portal merge).
 * Origin: top-left of page; x,y,w,h in 0..1 relative to page width/height.
 */
export type SignatureAnchorNorm = {
  pageIndex: number;
  rect: { x: number; y: number; w: number; h: number };
};

const EPS = 0.002;

export function parseSignatureAnchor(raw: unknown): SignatureAnchorNorm | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const pi =
    typeof o.pageIndex === "number"
      ? o.pageIndex
      : typeof o.page_index === "number"
        ? o.page_index
        : Number(o.pageIndex ?? o.page_index);
  const rect = o.rect as Record<string, unknown> | undefined;
  if (!rect || typeof rect !== "object") return null;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const w = Number(rect.w);
  const h = Number(rect.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  if (w < 0.02 || h < 0.02) return null;
  if (x < -EPS || y < -EPS) return null;
  if (x + w > 1 + EPS || y + h > 1 + EPS) return null;
  if (!Number.isFinite(pi) || pi < 0 || pi > 999) return null;
  return {
    pageIndex: Math.floor(pi),
    rect: {
      x: clamp01(x),
      y: clamp01(y),
      w: clamp01(w),
      h: clamp01(h),
    },
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
