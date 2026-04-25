/**
 * Client-safe branding (import from client components).
 */

export function publicBusinessName(): string {
  return (
    process.env.NEXT_PUBLIC_BUSINESS_NAME?.trim() || "Client CRM"
  );
}

export function publicBusinessTagline(): string {
  return (
    process.env.NEXT_PUBLIC_BUSINESS_TAGLINE?.trim() ||
    "ניהול לקוחות וחתימות דיגיטליות"
  );
}

export function publicBrandPrimary(): string {
  return process.env.NEXT_PUBLIC_BRAND_PRIMARY?.trim() || "#0f172a";
}

export function publicBrandSecondary(): string {
  return process.env.NEXT_PUBLIC_BRAND_SECONDARY?.trim() || "#2563eb";
}

export function publicBrandLogoUrl(): string {
  return process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim() || "/favicon.ico";
}
