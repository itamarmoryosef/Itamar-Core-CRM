import type { SupabaseClient } from "@supabase/supabase-js";
import { isProfilePlatformSuper } from "@/lib/teamAdmin";

/**
 * Resolves the organization id for an authenticated admin request (matches
 * /api/admin/features: super may pass ?organizationId=).
 */
export async function getOrganizationIdForAdminRequest(
  admin: SupabaseClient,
  userId: string,
  requestOrgId: string | null
): Promise<{ orgId: string | null; forbidden: boolean; profileError: string | null }> {
  const superU = await isProfilePlatformSuper(admin, userId);
  const { data: prof, error: pe } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (pe) {
    const m = pe.message?.toLowerCase() ?? "";
    if (!/organization_id|column|schema/.test(m)) {
      return { orgId: null, forbidden: false, profileError: pe.message };
    }
  }

  const profOrg = (prof as { organization_id?: string | null } | null)
    ?.organization_id?.trim() ?? null;
  const q = requestOrgId?.trim() ?? null;

  if (superU) {
    return { orgId: q || profOrg, forbidden: false, profileError: null };
  }
  if (q && profOrg && q !== profOrg) {
    return { orgId: null, forbidden: true, profileError: null };
  }
  return { orgId: profOrg, forbidden: false, profileError: null };
}
