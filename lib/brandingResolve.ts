import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { getSettingValue } from "@/lib/settingsServer";
import {
  SETTING_KEY_BRANDING_BUSINESS_NAME,
  SETTING_KEY_BRANDING_LOGO_URL,
  SETTING_KEY_BRANDING_PRIMARY,
  SETTING_KEY_BRANDING_SECONDARY,
  SETTING_KEY_BRANDING_TAGLINE,
} from "@/lib/settingsKeys";
import {
  brandColorPrimary,
  brandColorSecondary,
  brandLogoUrl,
  businessName,
  businessTagline,
} from "@/lib/branding";

export type ResolvedBranding = {
  businessName: string;
  tagline: string;
  primary: string;
  secondary: string;
  logoUrl: string;
};

let mem: { at: number; value: ResolvedBranding } | null = null;
const MEM_TTL_MS = 5_000;

function fromEnv(): ResolvedBranding {
  return {
    businessName: businessName(),
    tagline: businessTagline(),
    primary: brandColorPrimary(),
    secondary: brandColorSecondary(),
    logoUrl: brandLogoUrl(),
  };
}

/**
 * Merges `settings` table (when set) with `NEXT_PUBLIC_*` / `lib/branding` env fallbacks.
 * Short in-memory cache; call `invalidateResolvedBrandingCache` after admin branding save.
 */
export async function getResolvedBranding(): Promise<ResolvedBranding> {
  if (mem && Date.now() - mem.at < MEM_TTL_MS) return mem.value;
  const admin = createServiceRoleSupabase();
  const [n, t, p, s, l] = await Promise.all([
    getSettingValue(admin, SETTING_KEY_BRANDING_BUSINESS_NAME),
    getSettingValue(admin, SETTING_KEY_BRANDING_TAGLINE),
    getSettingValue(admin, SETTING_KEY_BRANDING_PRIMARY),
    getSettingValue(admin, SETTING_KEY_BRANDING_SECONDARY),
    getSettingValue(admin, SETTING_KEY_BRANDING_LOGO_URL),
  ]);
  const e = fromEnv();
  const value: ResolvedBranding = {
    businessName: n?.trim() || e.businessName,
    tagline: t?.trim() || e.tagline,
    primary: p?.trim() || e.primary,
    secondary: s?.trim() || e.secondary,
    logoUrl: l?.trim() || e.logoUrl,
  };
  mem = { at: Date.now(), value };
  return value;
}

export function invalidateResolvedBrandingCache(): void {
  mem = null;
}
