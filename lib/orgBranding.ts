/** Default admin accent when org has no primary in JSON. */
export const DEFAULT_PRIMARY_BRAND = "#6366F1";

/** Display name fallback when org JSON has no business name (product label). */
export const DEFAULT_PRODUCT_DISPLAY_NAME = "Alentix";

export type ParsedOrgBranding = {
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  whatsapp_enabled: boolean;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Maps `organizations.branding_settings` (and app_settings-style keys) to admin UI fields.
 */
export function parseOrganizationBranding(
  org: { name: string; branding_settings?: unknown } | null
): ParsedOrgBranding | null {
  if (!org?.name) return null;
  const o = asRecord(org.branding_settings);
  const brand_name =
    String(o.branding_business_name ?? o.brand_name ?? o.business_name ?? "")
      .trim() || org.name;
  const logoRaw = String(o.branding_logo_url ?? o.logo_url ?? "").trim();
  const logo_url = logoRaw.length > 0 ? logoRaw : null;
  const primaryRaw = String(
    o.branding_primary ?? o.primary_color ?? ""
  ).trim();
  const primary_color =
    primaryRaw.length > 0 ? primaryRaw : DEFAULT_PRIMARY_BRAND;
  const whatsapp_enabled = o.whatsapp_enabled === true;
  return { brand_name, logo_url, primary_color, whatsapp_enabled };
}
