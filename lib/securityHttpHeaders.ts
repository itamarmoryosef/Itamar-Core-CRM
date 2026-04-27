/**
 * Baseline HTTP security headers (OWASP ASVS–friendly, suitable as a starting point
 * for ISO 27001 / SOC2 technical controls — tune per your auditor + integrations).
 *
 * CSP is applied only in production so `next dev` (eval/HMR) is not blocked.
 * Extend connect-src via NEXT_PUBLIC_SECURITY_CSP_CONNECT_SRC (comma-separated origins).
 */

function supabaseConnectOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];
  try {
    const u = new URL(raw);
    const https = u.origin;
    const wss = `wss://${u.host}`;
    return [https, wss];
  } catch {
    return [];
  }
}

function extraConnectSrc(): string[] {
  const raw = process.env.NEXT_PUBLIC_SECURITY_CSP_CONNECT_SRC?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Content-Security-Policy for production (Next.js + Supabase + Google Fonts + pdfjs worker CDN). */
export function buildContentSecurityPolicy(): string {
  const connect = new Set<string>(["'self'", "https://unpkg.com"]);
  for (const o of supabaseConnectOrigins()) connect.add(o);
  for (const o of extraConnectSrc()) connect.add(o);

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    /** Next.js + React hydration; Vercel Live/feedback in preview; tighten with nonces for audit */
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    /** Tenant logos, storage URLs, signatures (data URLs) */
    "img-src 'self' data: blob: https:",
    `connect-src ${[...connect].join(" ")}`,
    "worker-src 'self' blob: https://unpkg.com",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

export type SecurityHeader = { key: string; value: string };

export function buildSecurityHeaders(): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    /** Legacy XSS filter off — avoids broken browser heuristics (modern mitigations = CSP) */
    { key: "X-XSS-Protection", value: "0" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "X-DNS-Prefetch-Control", value: "on" },
  ];

  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains; preload",
    });
    headers.push({
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(),
    });
  }

  return headers;
}
