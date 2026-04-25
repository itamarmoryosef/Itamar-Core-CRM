/**
 * White-label branding: business name, colors, tagline, default production host.
 * Override with NEXT_PUBLIC_BUSINESS_NAME, NEXT_PUBLIC_BRAND_PRIMARY, etc.
 */

const trim = (s: string | undefined) => s?.trim() || "";

export const defaultProductionOrigin = () =>
  trim(process.env.NEXT_PUBLIC_DEFAULT_SITE_ORIGIN) || "https://example.com";

export function businessName(): string {
  return trim(process.env.NEXT_PUBLIC_BUSINESS_NAME) || "Client CRM";
}

export function businessTagline(): string {
  return (
    trim(process.env.NEXT_PUBLIC_BUSINESS_TAGLINE) ||
    "ניהול לקוחות וחתימות דיגיטליות"
  );
}

/** Primary brand color (navbar, accents). CSS hex */
export function brandColorPrimary(): string {
  return trim(process.env.NEXT_PUBLIC_BRAND_PRIMARY) || "#0f172a";
}

export function brandColorSecondary(): string {
  return trim(process.env.NEXT_PUBLIC_BRAND_SECONDARY) || "#2563eb";
}

export function brandLogoUrl(): string {
  return trim(process.env.NEXT_PUBLIC_BRAND_LOGO_URL) || "/favicon.ico";
}

/** Shown in admin notifications, PDF headers, and WhatsApp copy */
export function adminNotificationSenderLabel(): string {
  return businessName();
}

export type PublicBranding = {
  businessName: string;
  tagline: string;
  primary: string;
  secondary: string;
  logoUrl: string;
};

export function getPublicBranding(): PublicBranding {
  return {
    businessName: businessName(),
    tagline: businessTagline(),
    primary: brandColorPrimary(),
    secondary: brandColorSecondary(),
    logoUrl: brandLogoUrl(),
  };
}
